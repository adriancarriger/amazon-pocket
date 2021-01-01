import * as csvtojson from 'csvtojson';
import { differenceInDays, format, parse, isAfter } from 'date-fns';

import { addTag } from '../mutation-functions';
import { Row } from '../rules.engine';

interface RawAmazonRow {
  'order id': string;
  items: string;
  to: string;
  date: string;
  total: string;
  postage: string;
  gift: string;
  tax: string;
  refund: string;
  payments: string;
}

interface AmazonItem {
  id: string;
  date: Date;
  total: number;
  originalPrice?: string | undefined;
  /**
   * pulled in
   */
  'Item Total': string;
  'Total Charged': string;
  'Order Date': string;
  Category?: string;
  Title: string;
  Seller: string;
}

export class AmazonPlugin {
  public name = 'Amazon';
  /**
   * A single Amazon order id can have multiple items associated with it.
   * This uses the amount charged as the key. Some orders will have multiple charges.
   *
   * key: price `1.23`
   * value: array of order ids
   */
  private amazonOrders: Record<string, AmazonItem[]> = {};
  private amazonItems: Record<string, AmazonItem[]>;
  private giftCardOrders: Record<string, Date> = {};
  private amazonRefunds: Record<string, AmazonItem>;
  /**
   * key: price
   * value: array of possible ids
   */
  private refundPrices: Record<number, string[]> = {};

  public async loadAmazonOrders() {
    const rawOrders: RawAmazonRow[] = await csvtojson().fromFile('./data/amazon-orders.csv');

    this.amazonItems = rawOrders.reduce((previous, current) => {
      if (
        current.total.includes('Audible Credit') ||
        current['order id'] === 'order id' ||
        current.total === '0'
      ) {
        return previous;
      }

      const id = current['order id'];
      previous[id] = previous[id] || [];

      const items = this.convertToItem(current);

      previous[id].push(...items);

      items.forEach((item) => {
        const orderKey = item.total.toFixed(2);

        this.amazonOrders[orderKey] = this.amazonOrders[orderKey] || [];
        this.amazonOrders[orderKey].push(item);
      });

      const hasGiftCard = Number(current.gift) > 0;
      if (hasGiftCard && !(id in this.giftCardOrders)) {
        this.giftCardOrders[id] = parse(current.date, 'yyyy-MM-dd', new Date());
      }

      return previous;
    }, {} as Record<string, AmazonItem[]>);

    this.amazonRefunds = rawOrders.reduce((previous, current) => {
      const id = current['order id'];
      const amount = Number(current.refund);

      if (amount === 0) {
        return previous;
      }

      const item = this.convertToItem(current);

      previous[id] = item[0];
      this.refundPrices[amount] = this.refundPrices[amount] || [];
      this.refundPrices[amount].push(id);

      return previous;
    }, {} as Record<string, AmazonItem>);
  }

  public needsUpdate(row: Row) {
    if (
      row.note ||
      row.original_payee.toLowerCase().match(/Amazon|amzn/gi) === null ||
      ['AMAZON WEB SERVI', 'Prime Video'].some((item) => row.original_payee.startsWith(item)) ||
      // Filter out Amazon Prime subscription charges
      row.original_payee.includes('Amazon Prime')
    ) {
      return;
    }

    const parsedDate = parse(row.date, 'yyyy-MM-dd', new Date());

    if (isAfter(parse('2019-12-31', 'yyyy-MM-dd', new Date()), parsedDate)) {
      return;
    }

    /**
     * should probabaly skip here if it contains the tag `Amazon`,
     * and instead start keying off something like `Amazon-2.0`
     */

    if (Number(row.amount) > 0 && this.refundPrices[row.amount]) {
      /**
       * TODO: add sorting by date
       */
      const id = this.refundPrices[row.amount][0];

      this.createRefundUpdate(row, id);

      return true;
    }

    row.sharedPluginData.parsedDate = parse(row.date, 'yyyy-MM-dd', new Date());
    const orderId = this.findBestMatch(row);

    if (orderId) {
      const matchedItem = this.amazonItems[orderId].find((item) => -item.total === row.amount);

      this.createUpdateItem(row, matchedItem, orderId, -Number(matchedItem.total));

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

    console.log('Amazon Plugin: No match found', { date: row.date, amount: row.amount });
  }

  private findPossibleGiftCards(row: Row) {
    return Object.keys(this.giftCardOrders).reduce((giftCards, orderId) => {
      if (this.nearbyDate(row.sharedPluginData.parsedDate, this.giftCardOrders[orderId])) {
        giftCards.push(orderId);
      }

      return giftCards;
    }, []);
  }

  private createRefundUpdate(row: Row, refundId: string) {
    const refund = this.amazonRefunds[refundId];

    this.createUpdateItem(row, refund, refundId, row.amount);

    addTag(row, 'Refund');
  }

  private createUpdateItem(row: Row, item: AmazonItem, orderId: string, itemAmount: number) {
    const originalPrice = item.originalPrice ? `\n\nOriginal price: ${item.originalPrice}` : '';
    const description = item.Title + originalPrice + `\n\n${this.orderLink(orderId)}`;
    row.note = description;

    if (row.note.split(';').length > 2) {
      addTag(row, 'RequiresSplit');
    }

    addTag(row, 'Amazon');
    row.payee = item.Seller;
    row.date = item['Order Date'];

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
  private findBestMatch(row: Row) {
    const priceKey = Math.abs(Number(row.amount)).toFixed(2);

    const possibleMatches = this.getPossibleMatches(priceKey, row.sharedPluginData.parsedDate);

    if (possibleMatches.length === 0) {
      return;
    } else if (possibleMatches.length === 1) {
      return possibleMatches[0].id;
    }

    /**
     * TODO: add sorting by date
     */
    return possibleMatches[0].id;
  }

  private getPossibleMatches(priceKey: string, input: Date) {
    return (this.amazonOrders[priceKey] || []).filter((item) => this.nearbyDate(item.date, input));
  }

  private nearbyDate(date1: Date | number, date2: Date | number) {
    return Math.abs(differenceInDays(date1, date2)) < 10;
  }

  private orderLink(orderId: string) {
    const urlBase = 'https://www.amazon.com/gp/your-account/order-details?ie=UTF8&orderID';

    return `${urlBase}=${orderId}`;
  }

  private convertToItem(current: RawAmazonRow): AmazonItem[] {
    const items = current.payments
      .split(';')
      .map((item) => item.trim())
      .slice(0, -1)
      .map((item) => {
        if (item === 'UNKNOWN') {
          return {
            date: parse(current.date, 'yyyy-MM-dd', new Date()),
            amount: current.total,
          };
        }

        const sections = item.split(':').map((subItem) => subItem.trim());
        const amount = sections.slice(-1)[0].split('$').join('');
        const rawDate = sections.slice(-2)[0].replace(/\s/g, ' ');

        const incomingFormat = rawDate.startsWith('20') ? 'yyyy-MM-dd' : 'MMMM d, yyyy';
        const date = parse(rawDate, incomingFormat, new Date());

        return { date, amount };
      });

    return items.map(({ date, amount }) => ({
      id: current['order id'],
      total: Number(amount),
      date,

      /**
       * Pulled in items
       */
      'Item Total': amount,
      'Total Charged': amount,
      'Order Date': format(date, 'yyyy-MM-dd'),
      Title: current.items,
      Seller: 'Amazon Purchase',
    }));
  }
}
