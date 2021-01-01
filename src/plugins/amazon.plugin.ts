import * as csvtojson from 'csvtojson';
import { differenceInDays, format, parse } from 'date-fns';

import { addTag } from '../mutation-functions';

export class AmazonPlugin {
  public name = 'Amazon';
  private amazonOrders;
  private amazonItems;
  private orderTotals = {};
  private giftCardOrders = {};
  private amazonRefunds;
  private refundPrices = {};

  public async loadAmazonOrders() {
    const rawOrders = await csvtojson().fromFile('./data/amazon-orders.csv');
    const rawItems = await csvtojson().fromFile('./data/amazon-items.csv');
    const rawRefunds = await csvtojson().fromFile('./data/amazon-refunds.csv');

    this.amazonItems = rawItems.reduce((previous, current) => {
      const id = current['Order ID'];
      previous[id] = previous[id] || [];

      previous[id].push({
        ...current,
        total: this.extractAmount(current['Item Total']),
        date: parse(current['Order Date']),
      });

      return previous;
    }, {});

    const orderGroups = rawOrders.reduce((previous, rawOrder) => {
      const id = rawOrder['Order ID'];
      previous[id] = previous[id] || [];
      previous[id].push(rawOrder);

      const hasGiftCard = rawOrder['Payment Instrument Type'].includes('Gift Certificate/Card');
      if (hasGiftCard && !(id in this.giftCardOrders)) {
        this.giftCardOrders[id] = parse(rawOrder['Order Date']);
      }

      return previous;
    }, {});

    this.amazonOrders = Object.keys(orderGroups).reduce((previous, orderId) => {
      const orderTotal = this.getOrderTotal(orderGroups[orderId]);
      const orderKey = orderTotal.toFixed(2);
      const itemsTotal = this.getItemsTotal(this.amazonItems[orderId]);
      this.orderTotals[orderId] = {
        itemsTotal,
        charged: orderTotal,
        diffInCents: this.cents(orderTotal) - this.cents(itemsTotal),
      };
      if (this.orderTotals[orderId].diffInCents !== 0) {
        this.spreadOrderDiff(orderId);
      }
      previous[orderKey] = previous[orderKey] || [];
      previous[orderKey].push(orderId);

      return previous;
    }, {});

    this.amazonRefunds = rawRefunds.reduce((previous, current) => {
      const id = current['Order ID'];
      const amount =
        (this.cents(this.extractAmount(current['Refund Amount'])) +
          this.cents(this.extractAmount(current['Refund Tax Amount']))) /
        100;

      current.date = parse(current['Refund Date']);
      previous[id] = current;
      this.refundPrices[amount] = this.refundPrices[amount] || [];
      this.refundPrices[amount].push(id);

      return previous;
    }, {});
  }

  public needsUpdate(row) {
    if (row.note || row.original_payee.toLowerCase().match(/Amazon|amzn/gi) === null) {
      return;
    }

    if (Number(row.amount) > 0 && this.refundPrices[row.amount]) {
      const id = this.refundPrices[row.amount].sort((a, b) =>
        this.compareDate(a[0].date, b[0].date, row)
      )[0];

      this.createRefundUpdate(row, id);

      return true;
    }

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

  private findPossibleGiftCards(row) {
    return Object.keys(this.giftCardOrders).reduce((giftCards, orderId) => {
      if (this.nearbyDate(row.sharedPluginData.parsedDate, this.giftCardOrders[orderId])) {
        giftCards.push(orderId);
      }

      return giftCards;
    }, []);
  }

  private createRefundUpdate(row, refundId) {
    const refund = this.amazonRefunds[refundId];

    this.createUpdateItem(row, refund, refundId, row.amount);
    addTag(row, 'Refund');
  }

  private createPurchaseUpdate(row, item, orderId) {
    const itemAmount = -this.extractAmount(item['Item Total']);

    this.createUpdateItem(row, item, orderId, itemAmount);
  }

  private createUpdateItem(row, item, orderId, itemAmount) {
    const originalPrice = item.originalPrice ? `\n\nOriginal price: ${item.originalPrice}` : '';
    const description = item.Title + originalPrice + `\n\n${this.orderLink(orderId)}`;
    row.note = description;
    addTag(row, 'Amazon');
    row.payee = item.Seller;
    row.date = this.formatAmazonDate(item['Order Date']);

    if (item.Category) {
      row.sharedPluginData.amazonCateogry = item.Category;
      addTag(row, item.Category);
    }

    if (row.amount !== itemAmount) {
      row.amount = itemAmount;
    }

    if (item.originalPrice) {
      addTag(row, 'Adjustment');
    }

    if (row.sharedPluginData.split) {
      addTag(row, 'Split');
    }
  }

  // Returns an order id
  private findBestMatch(row) {
    const priceKey = Math.abs(Number(row.amount)).toFixed(2);

    const possibleMatches = this.getPossibleMatches(priceKey, row.sharedPluginData.parsedDate);

    if (possibleMatches.length === 0) {
      return;
    } else if (possibleMatches.length === 1) {
      return possibleMatches[0];
    }

    return possibleMatches.sort((a, b) => this.compareDate(a[0].date, b[0].date, row))[0]; // // dedup in v2 🙂
  }

  private getPossibleMatches(priceKey, input) {
    return (this.amazonOrders[priceKey] || []).filter((orderId) =>
      this.nearbyDate(this.amazonItems[orderId][0].date, input)
    );
  }

  private getItemsTotal(items) {
    return items.reduce((total, { total: itemTotal }) => total + itemTotal, 0).toFixed(2);
  }

  private getOrderTotal(items): number {
    return items.reduce((total, item) => total + this.extractAmount(item['Total Charged']), 0);
  }

  private spreadOrderDiff(orderId) {
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

  private cents(input) {
    return Math.round(input * 100);
  }

  private nearbyDate(date1, date2) {
    return Math.abs(differenceInDays(date1, date2)) < 10;
  }

  private orderLink(orderId) {
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

  private compareDate(a, b, row) {
    const optionA = Math.abs(differenceInDays(a, row.sharedPluginData.parsedDate));
    const optionB = Math.abs(differenceInDays(b, row.sharedPluginData.parsedDate));

    return optionA - optionB;
  }
}
