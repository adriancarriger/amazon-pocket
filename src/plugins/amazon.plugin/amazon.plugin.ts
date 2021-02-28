import { differenceInDays, format, parse, isAfter } from 'date-fns';

import { Row } from '../../rules.engine';
import { addTag } from '../../mutation-functions';
import getRawOrders, { RawOrder } from './raw/getRawOrders';
import getRawItems, { RawItem } from './raw/getRawItems';
import getRawRefunds, { RawRefund } from './raw/getRawRefunds';
import getRawTransactions, { RawTransaction } from './raw/getRawTransactions';
import findCombination from './findCombination';

export interface AmazonItem extends RawItem {
  total: number;
  date: Date;
  originalPrice?: string;
  cents?: number;
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
type AmazonOrders = Record<string, RawOrder[][]>;
type AmazonRefunds = Record<string, AmazonRefund>;

export class AmazonPlugin {
  public name = 'Amazon';
  private rawOrders: RawOrder[];
  private transactions: RawTransaction[];
  private amazonOrders: AmazonOrders = {};
  private amazonItems: AmazonItems;
  private orderTotals: Record<string, OrderTotal> = {};
  private giftCardOrders: Record<string, Date> = {};
  private amazonRefunds: AmazonRefunds;
  private refundPrices: Record<string, string[]> = {};
  private ordersTaken: string[] = [];
  private orderGroupTotal: Record<string, number> = {};

  public async loadAmazonOrders() {
    this.rawOrders = await getRawOrders();
    const rawItems = await getRawItems();
    const rawRefunds = await getRawRefunds();
    this.transactions = await getRawTransactions();

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

    const orderGroups = this.rawOrders.reduce((previous, rawOrder) => {
      const id = rawOrder['Order ID'];
      previous[id] = previous[id] || [];
      previous[id].push(rawOrder);

      const hasGiftCard = rawOrder['Payment Instrument Type'].includes('Gift Certificate/Card');
      if (hasGiftCard && !(id in this.giftCardOrders)) {
        this.giftCardOrders[id] = parse(rawOrder['Order Date']);
      }

      const orderKey = this.extractAmount(rawOrder['Total Charged']).toFixed(2);
      this.amazonOrders[orderKey] = this.amazonOrders[orderKey] || [];
      this.amazonOrders[orderKey].push([rawOrder]);

      return previous;
    }, {} as Record<string, RawOrder[]>);

    const addOrderGroup = (orderGroup: RawOrder[]) => {
      const orderTotal = this.getOrderTotal(orderGroup);
      const orderKey = orderTotal.toFixed(2);
      const orderId = orderGroup[0]['Order ID'];

      if (
        this.amazonOrders[orderKey] &&
        !this.amazonOrders[orderKey].some((groupItem) => orderId === groupItem[0]['Order ID'])
      ) {
        return;
      }

      this.amazonOrders[orderKey] = this.amazonOrders[orderKey] || [];
      this.amazonOrders[orderKey].push(orderGroup);
    };

    Object.entries(orderGroups).forEach(([orderId, orderGroup]) => {
      this.orderGroupTotal[orderId] = orderGroup.reduce(
        (previous, current) => previous + this.extractAmount(current['Total Charged']),
        0
      );

      const itemsTotal = this.getItemsTotal(this.amazonItems[orderId]);

      this.orderTotals[orderId] = {
        itemsTotal,
        charged: this.orderGroupTotal[orderId],
        diffInCents: this.cents(this.orderGroupTotal[orderId]) - this.cents(Number(itemsTotal)),
      };

      if (this.orderTotals[orderId].diffInCents !== 0) {
        // this.spreadOrderDiff(orderId);
        return;
      }

      if (orderGroup.length === 1) {
        return;
      }

      addOrderGroup(orderGroup);

      const ordersGroupedByShippingDate = orderGroup.reduce((previous, current) => {
        previous[current['Shipment Date']] = previous[current['Shipment Date']] || [];
        previous[current['Shipment Date']].push(current);

        return previous;
      }, {} as Record<string, RawOrder[]>);

      if (Object.keys(ordersGroupedByShippingDate).length > 1) {
        Object.entries(ordersGroupedByShippingDate).forEach(
          ([shippingDate, shippingOrderGroup]) => {
            addOrderGroup(shippingOrderGroup);
          }
        );
      }
    });

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
    if (
      row.note ||
      row.original_payee.toLowerCase().match(/Amazon|amzn/gi) === null ||
      ['AMAZON WEB SERVI', 'Prime Video', 'AMZN Digital'].some((item) =>
        row.original_payee.startsWith(item)
      ) ||
      // Filter out Amazon Prime subscription charges
      row.original_payee.includes('Amazon Prime')
    ) {
      return;
    }

    if (Number(row.amount) > 0 && this.refundPrices[row.amount]) {
      console.log('Not sorting;', this.refundPrices[row.amount]);
      // .sort((a, b) => this.compareDate(a[0].date, b[0].date, row))
      const id = this.refundPrices[row.amount][0];

      this.createRefundUpdate(row, id);

      return true;
    }

    row.sharedPluginData = row.sharedPluginData || {};
    row.sharedPluginData.parsedDate = parse(row.date);
    const orderGroup = this.findBestMatch(row);

    if (orderGroup) {
      const orderId = orderGroup[0]['Order ID'];

      if (this.amazonItems[orderId].length > 1) {
        const combo = findCombination({
          charge: -row.amount,
          items: this.amazonItems[orderId],
          orderTotal: this.orderGroupTotal[orderId],
        });

        if (combo) {
          // row.sharedPluginData.split = true;
          // const rowCopy: Row = JSON.parse(JSON.stringify(row));
          // row.splitItems = [];
          // combo.forEach((orderItem) => {
          //   /**
          //    * TODO
          //    * should probably mark each item as taken - so the same one doesn't get used twice
          //    */
          //   const rowItem: Row = JSON.parse(JSON.stringify(rowCopy));
          //   this.createPurchaseUpdate(rowItem, orderItem, orderId);
          //   row.splitItems.push(rowItem);
          // });
        } else {
          row.note = `This purchase could not be sorted.\n\n${this.orderLink(orderId)}`;
          addTag(row, 'RequiresAHuman');
        }
      } else {
        this.createPurchaseUpdate(row, this.amazonItems[orderId][0], orderId);
      }

      return true;
    }

    const possibleGiftCards = this.findPossibleGiftCards(row);

    if (possibleGiftCards.length) {
      const links = possibleGiftCards.map((id) => `• ${this.orderLink(id)}`).join('\n');

      row.note = `This purchase may involve an Amazon gift card.\n\nPossible orders:\n${links}`;
      addTag(row, 'PossibleGiftCard');

      return true;
    }

    console.log('no match found', row);
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
      // row.amount = itemAmount;
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

    const directMatch = this.transactions.find(
      (transaction) => row.amount === Number(transaction.Amount) && row.date === transaction.Date
    );

    if (directMatch) {
      const matches = this.rawOrders.filter((rawOrder) => rawOrder['Order ID'] === directMatch.Id);

      if (matches.length > 0) {
        return matches;
      }
    }

    const possibleMatches = this.getPossibleMatches(priceKey, row.sharedPluginData.parsedDate, row);

    if (possibleMatches.length > 1) {
      const totalDates = possibleMatches.reduce((previous, current) => {
        current.forEach((item) => {
          if (
            -this.extractAmount(item['Total Charged']) === row.amount &&
            !previous.includes(item['Shipment Date'])
          ) {
            previous.push(item['Shipment Date']);
          }
        });

        return previous;
      }, [] as string[]);

      if (totalDates.length === 1) {
        this.ordersTaken.push(possibleMatches[0][0]['Order ID']);
      }
    }

    return possibleMatches[0];
  }

  private getPossibleMatches(priceKey: string, input: Date, row: Row) {
    return (
      (this.amazonOrders[priceKey] || [])
        .reduce((previous, orderGroup) => {
          const orderDate = parse(orderGroup[0]['Shipment Date']);

          if (
            this.nearbyDate(orderDate, input) &&
            /** Not sure if `isAfter` matters here */
            !isAfter(orderDate, input) &&
            !previous.some((item) => item[0]['Order ID'] === orderGroup[0]['Order ID']) &&
            !this.ordersTaken.includes(orderGroup[0]['Order ID'])
          ) {
            return [...previous, orderGroup];
          }

          return previous;
        }, [] as RawOrder[][])
        /**
         * Prefer matches that are closer to target
         *
         * TODO: compare the last Shipment Date if multiple in an order group
         */
        .sort((a, b) =>
          this.compareDate(parse(a[0]['Shipment Date']), parse(b[0]['Shipment Date']), row)
        )
    );
  }

  private getItemsTotal(items: AmazonItem[]) {
    return items.reduce((total, { total: itemTotal }) => total + itemTotal, 0).toFixed(2);
  }

  private getOrderTotal(items: RawOrder[]): number {
    return items.reduce((total, item) => total + this.extractAmount(item['Total Charged']), 0);
  }

  // private spreadOrderDiff(orderId: string) {
  //   const spreadItems = this.amazonItems[orderId].length;
  //   const remainderInCents = this.orderTotals[orderId].diffInCents % spreadItems;
  //   const spreadTotalInCents = this.orderTotals[orderId].diffInCents - remainderInCents;
  //   const spreadInCents = spreadTotalInCents / spreadItems;

  //   this.amazonItems[orderId].forEach((item, index) => {
  //     const updateAmountInCents = spreadInCents + (index === 0 ? remainderInCents : 0);
  //     const amount = this.cents(this.extractAmount(item['Item Total']));
  //     const amountInCents = updateAmountInCents + amount;
  //     item.originalPrice = item['Item Total'];
  //     item['Item Total'] = `$${(amountInCents / 100).toFixed(2)}`;
  //   });
  // }

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

  private compareDate(a: Date, b: Date, row: Row) {
    if (!row.sharedPluginData?.parsedDate) {
      return 0;
    }

    const optionA = Math.abs(differenceInDays(a, row.sharedPluginData.parsedDate));
    const optionB = Math.abs(differenceInDays(b, row.sharedPluginData.parsedDate));

    return optionA - optionB;
  }
}
