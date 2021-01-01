import * as puppeteer from 'puppeteer';
import * as request from 'request';
import { format, parse } from 'date-fns';

export default class PocketService {
  private page: puppeteer.Page;
  private browser: puppeteer.Browser;

  public async login() {
    if (!process.env.POCKET_USERNAME || !process.env.POCKET_TOKEN) {
      throw new Error('☠️   ☠️   ☠️   - Your username and token are required to run this update.');
    }
    await this.page.goto('https://my.pocketsmith.com/login');
    await this.page.keyboard.type(process.env.POCKET_USERNAME);
    await this.page.keyboard.press('Tab');
    await this.page.keyboard.type(process.env.POCKET_TOKEN);
    await this.page.keyboard.press('Enter');
    await this.page.waitForNavigation();
    console.log('Logged in!');
  }

  public async getTransactions() {
    console.log('getTransactions - Started');
    await this.page.goto('https://my.pocketsmith.com/transactions/search', {
      waitUntil: 'networkidle0',
    });

    const today = format(parse(new Date()), 'MMM D, YYYY');

    const response = await this.pocketRequest({
      url: 'https://my.pocketsmith.com/transactions/query.json',
      formData: {
        _no_redirect: '1',
        'saved_search[by_feed_categories_flag]': '0',
        'saved_search[by_date_range]': `Oct 1, 2018 - ${today}`,
        'saved_search[filter_attributes][do_change_transfer_flag]': '0',
        'saved_search[filter_attributes][do_change_transfer]': 'transfer',
        per_page: '3000',
        page: '1',
        'sort[col]': 'date',
        'sort[dir]': 'desc',
        include_totals: '1',
        summary: '1',
      },
    });

    console.log('getTransactions - Done!');

    return JSON.parse(response.body).results;
  }

  public async closeBrowser() {
    this.browser.close();
  }

  public async setupBrowser() {
    this.browser = await puppeteer.launch();
    this.page = await this.browser.newPage();
    this.page.setViewport({ width: 1000, height: 1200 });
  }

  public async sendUpdates(updates) {
    console.log('updateTransactions - Started');

    await this.page.goto('https://my.pocketsmith.com/transactions/search', {
      waitUntil: 'networkidle0',
    });

    let delay = 0;

    await Promise.all(
      updates.map((update) => {
        delay += 500;
        return this.makeUpdate(update, delay);
      })
    );

    console.log('updateTransactions - Complete');
  }

  private async makeUpdate(update, delay = 0) {
    await this.wait(delay);

    const formData = {
      _no_redirect: '1',
      per_page: '1',
      page: '1',
      'sort[col]': 'date',
      'sort[dir]': 'desc',
      include_totals: '1',
      summary: '1',
      update: '1',
      id: update.id,
    };

    if (update.splitItems) {
      let updateId = 1252339549301;
      update.splitItems.forEach((updateItem, index) => {
        updateId++;
        const prefix = index === 0 ? '' : `s[${updateId}]`;
        this.addUpdateData(formData, updateItem, prefix, this.getAmount(updateItem));
      });
    } else {
      const amount = update.tags.includes('Adjustment') ? this.getAmount(update) : undefined;
      this.addUpdateData(formData, update, '', amount);
    }

    console.log(`making update - ID: ${update.id}, date: ${update.date}, amount: ${update.amount}`);

    const response = await this.pocketRequest({
      url: 'https://my.pocketsmith.com/transactions/query.json',
      formData,
    });
    console.log(`Update ID: ${update.id} completed with code ${response.statusCode}`);
  }

  private addUpdateData(formData, update, prefix = '', amount?) {
    formData[`transaction${prefix}[tag_list]`] = update.tags.join(',');
    formData[`transaction${prefix}[payee]`] = update.payee;
    formData[`transaction${prefix}[date]`] = format(parse(update.date), 'MMM D, YYYY');

    if (update.note) {
      formData[`transaction${prefix}[note]`] = update.note;
    }

    if (update.category_title) {
      formData[`transaction${prefix}[selected_category_title]`] = update.category_title;
    }

    if (amount) {
      formData[`transaction${prefix}[amount]`] = amount;
    }
  }

  private async pocketRequest(data): Promise<request.Response> {
    const requestData = {
      method: 'POST',
      url: data.url,
      headers: {
        cookie: await this.cookie(),
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-csrf-token': await this.authToken(),
        'x-requested-with': 'XMLHttpRequest',
      },
      formData: { ...data.formData },
    };

    return new Promise((resolve, reject) => {
      const uploadRequest = request(requestData, (error, response) => {
        if (error) {
          reject(error);
        }
        resolve(response);
      });

      if (data.formParts) {
        const form = uploadRequest.form();
        data.formParts.forEach((part) => {
          Object.keys(part).forEach((key) => {
            form.append(key, part[key]);
          });
        });
      }
    });
  }

  private async cookie() {
    return (await this.page.cookies()).map(({ name, value }) => `${name}=${value}`).join('; ');
  }

  private async authToken() {
    return this.page.evaluate(() => {
      return (document.querySelector('[name="csrf-token"]') as any).content;
    });
  }

  private async wait(time) {
    return new Promise((resolve) => {
      setTimeout(resolve, time);
    });
  }

  private getAmount(updateItem) {
    return `${Math.abs(updateItem.amount).toFixed(2)}`;
  }
}
