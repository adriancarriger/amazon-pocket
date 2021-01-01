import { differenceInDays, format, parse } from 'date-fns';

import { Row } from '../../rules.engine';
import { addTag } from '../../mutation-functions';
import getRawOrders, { RawOrder } from './raw/getRawOrders';
import getRawItems, { RawItem } from './raw/getRawItems';
import getRawRefunds, { RawRefund } from './raw/getRawRefunds';

export interface AmazonItem extends RawItem {
  total: number;
  date: Date;
  originalPrice?: string;
}

export interface AmazonRefund extends RawRefund {
  date: Date;
}

export interface OrderTotal {
  itemsTotal: string;
  charged: number;
  diffInCents: number;
}

type AmazonItems = Record<string, AmazonItem[]>;
type AmazonOrders = Record<string, string[]>;
type AmazonRefunds = Record<string, AmazonRefund>;

export class AmazonPlugin {
  public name = 'Amazon';
  private amazonOrders: AmazonOrders;
  private amazonItems: AmazonItems;
  private orderTotals: Record<string, OrderTotal> = {};
  private giftCardOrders: Record<string, Date> = {};
  private amazonRefunds: AmazonRefunds;
  private refundPrices: Record<string, string[]> = {};

  public async loadAmazonOrders() {
    const rawOrders = await getRawOrders();
    const rawItems = await getRawItems();
    const rawRefunds = await getRawRefunds();

    this.amazonItems = rawItems.reduce((previous, current) => {
      const id = current['Order ID'];
      previous[id] = previous[id] || [];

      previous[id].push({
        ...current,
        total: this.extractAmount(current['Item Total']),
        date: parse(current['Order Date']),
      });

      return previous;
    }, {} as AmazonItems);

    const orderGroups = rawOrders.reduce((previous, rawOrder) => {
      const id = rawOrder['Order ID'];
      previous[id] = previous[id] || [];
      previous[id].push(rawOrder);

      const hasGiftCard = rawOrder['Payment Instrument Type'].includes('Gift Certificate/Card');
      if (hasGiftCard && !(id in this.giftCardOrders)) {
        this.giftCardOrders[id] = parse(rawOrder['Order Date']);
      }

      return previous;
    }, {} as Record<string, RawOrder[]>);

    this.amazonOrders = Object.entries(orderGroups).reduce((previous, [orderId, order]) => {
      const orderTotal = this.getOrderTotal(order);
      const orderKey = orderTotal.toFixed(2);
      const itemsTotal = this.getItemsTotal(this.amazonItems[orderId]);
      this.orderTotals[orderId] = {
        itemsTotal,
        charged: orderTotal,
        diffInCents: this.cents(orderTotal) - this.cents(Number(itemsTotal)),
      };
      if (this.orderTotals[orderId].diffInCents !== 0) {
        this.spreadOrderDiff(orderId);
      }
      previous[orderKey] = previous[orderKey] || [];
      previous[orderKey].push(orderId);

      return previous;
    }, {} as AmazonOrders);

    this.amazonRefunds = rawRefunds.reduce((previous, current) => {
      const id = current['Order ID'];
      const amount =
        (this.cents(this.extractAmount(current['Refund Amount'])) +
          this.cents(this.extractAmount(current['Refund Tax Amount']))) /
        100;

      previous[id] = { ...current, date: parse(current['Refund Date']) };
      this.refundPrices[amount] = this.refundPrices[amount] || [];
      this.refundPrices[amount].push(id);

      return previous;
    }, {} as AmazonRefunds);
  }

  public needsUpdate(row: Row) {
    if (row.note || row.original_payee.toLowerCase().match(/Amazon|amzn/gi) === null) {
      return;
    }

    if (Number(row.amount) > 0 && this.refundPrices[row.amount]) {
      const id = this.refundPrices[row.amount][0];

      this.createRefundUpdate(row, id);

      return true;
    }

    row.sharedPluginData = row.sharedPluginData || {};
    row.sharedPluginData.parsedDate = parse(row.date);
    const orderId = this.findBestMatch(row);

    if (orderId) {
      if (this.amazonItems[orderId].length > 1) {
        row.sharedPluginData.split = true;
        const rowCopy = JSON.parse(JSON.stringify(row));
        row.splitItems = [];
        this.amazonItems[orderId].forEach((orderItem) => {
          const rowItem = JSON.parse(JSON.stringify(rowCopy));
          this.createPurchaseUpdate(rowItem, orderItem, orderId);
          row.splitItems.push(rowItem);
        });
      } else {
        this.createPurchaseUpdate(row, this.amazonItems[orderId][0], orderId);
      }

      return true;
    }

    if (row.original_payee.includes('PURCHASE AUTHORIZED')) {
      const possibleGiftCards = this.findPossibleGiftCards(row);

      if (possibleGiftCards.length) {
        const links = possibleGiftCards.map((id) => `• ${this.orderLink(id)}`).join('\n');

        row.note = `This purchase may involve an Amazon gift card.\n\nPossible orders:\n${links}`;
        addTag(row, 'PossibleGiftCard');

        return true;
      }
    }
  }

  private findPossibleGiftCards(row: Row) {
    return Object.keys(this.giftCardOrders).reduce((giftCards, orderId) => {
      if (
        row.sharedPluginData?.parsedDate &&
        this.nearbyDate(row.sharedPluginData.parsedDate, this.giftCardOrders[orderId])
      ) {
        giftCards.push(orderId);
      }

      return giftCards;
    }, [] as string[]);
  }

  private createRefundUpdate(row: Row, refundId: string) {
    const refund = this.amazonRefunds[refundId];

    this.createUpdateItem(row, refund, refundId, row.amount);
    addTag(row, 'Refund');
  }

  private createPurchaseUpdate(row: Row, item: AmazonItem, orderId: string) {
    const itemAmount = -this.extractAmount(item['Item Total']);

    this.createUpdateItem(row, item, orderId, itemAmount);
  }

  private createUpdateItem(
    row: Row,
    item: AmazonItem | AmazonRefund,
    orderId: string,
    itemAmount: number
  ) {
    const originalPrice =
      'originalPrice' in item && item.originalPrice
        ? `\n\nOriginal price: ${item.originalPrice}`
        : '';
    const description = item.Title + originalPrice + `\n\n${this.orderLink(orderId)}`;
    row.note = description;
    addTag(row, 'Amazon');
    row.payee = item.Seller;
    row.date = this.formatAmazonDate(item['Order Date']);

    if (item.Category) {
      row.sharedPluginData = row.sharedPluginData || {};
      row.sharedPluginData.amazonCateogry = item.Category;
      addTag(row, item.Category);
    }

    if (row.amount !== itemAmount) {
      row.amount = itemAmount;
    }

    if ('originalPrice' in item && item.originalPrice) {
      addTag(row, 'Adjustment');
    }

    if (row.sharedPluginData?.split) {
      addTag(row, 'Split');
    }
  }

  // Returns an order id
  private findBestMatch(row: Row) {
    const priceKey = Math.abs(Number(row.amount)).toFixed(2);

    if (!row.sharedPluginData?.parsedDate) {
      return undefined;
    }

    const possibleMatches = this.getPossibleMatches(priceKey, row.sharedPluginData.parsedDate);

    if (possibleMatches.length === 0) {
      return;
    } else if (possibleMatches.length === 1) {
      return possibleMatches[0];
    }

    return possibleMatches[0];
  }

  private getPossibleMatches(priceKey: string, input: Date) {
    return (this.amazonOrders[priceKey] || []).filter((orderId) =>
      this.nearbyDate(this.amazonItems[orderId][0].date, input)
    );
  }

  private getItemsTotal(items: AmazonItem[]) {
    return items.reduce((total, { total: itemTotal }) => total + itemTotal, 0).toFixed(2);
  }

  private getOrderTotal(items: RawOrder[]): number {
    return items.reduce((total, item) => total + this.extractAmount(item['Total Charged']), 0);
  }

  private spreadOrderDiff(orderId: string) {
    const spreadItems = this.amazonItems[orderId].length;
    const remainderInCents = this.orderTotals[orderId].diffInCents % spreadItems;
    const spreadTotalInCents = this.orderTotals[orderId].diffInCents - remainderInCents;
    const spreadInCents = spreadTotalInCents / spreadItems;

    this.amazonItems[orderId].forEach((item, index) => {
      const updateAmountInCents = spreadInCents + (index === 0 ? remainderInCents : 0);
      const amount = this.cents(this.extractAmount(item['Item Total']));
      const amountInCents = updateAmountInCents + amount;
      item.originalPrice = item['Item Total'];
      item['Item Total'] = `$${(amountInCents / 100).toFixed(2)}`;
    });
  }

  private extractAmount(input: string): number {
    return Number(input.slice(1));
  }

  private cents(input: number) {
    return Math.round(input * 100);
  }

  private nearbyDate(date1: Date | string | number, date2: Date | string | number) {
    return Math.abs(differenceInDays(date1, date2)) < 10;
  }

  private orderLink(orderId: string) {
    const urlBase = 'https://www.amazon.com/gp/your-account/order-details?ie=UTF8&orderID';

    return `${urlBase}=${orderId}`;
  }

  private formatAmazonDate(dateInput: string) {
    const dateItem = dateInput.split('/');
    return format(
      parse(`20${dateItem[2]}-${dateItem[0]}-${dateItem[1]}`), // I know… 😐
      'YYYY-MM-DD'
    );
  }

  private compareDate(a: Date | string | number, b: Date | string | number, row: Row) {
    if (!row.sharedPluginData?.parsedDate) {
      return;
    }

    const optionA = Math.abs(differenceInDays(a, row.sharedPluginData.parsedDate));
    const optionB = Math.abs(differenceInDays(b, row.sharedPluginData.parsedDate));

    return optionA - optionB;
  }
}
