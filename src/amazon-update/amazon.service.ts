import * as puppeteer from 'puppeteer';
import * as fs from 'fs-extra';

const globby = require('globby');

export default class AmazonService {
  private page: puppeteer.Page;
  private browser: puppeteer.Browser;

  public async login() {
    const { AMAZON_USERNAME, AMAZON_PASSWORD } = this.getAmazonCredentials();
    await this.page.goto('https://www.amazon.com/gp/b2b/reports', {
      waitUntil: 'networkidle0',
    });
    await this.page.keyboard.type(AMAZON_USERNAME);
    await this.page.keyboard.press('Enter');
    await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
    await this.page.keyboard.type(AMAZON_PASSWORD);
    await this.page.keyboard.press('Enter');
    console.log('Logged in!');
  }

  public async closeBrowser() {
    this.browser.close();
  }

  public async setupBrowser() {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
    });
    this.page = await this.browser.newPage();
  }

  async downloadType(type: 'items' | 'orders' | 'refunds') {
    const typeMap = {
      items: 'ITEMS',
      orders: 'SHIPMENTS',
      refunds: 'REFUNDS',
    };
    const directory = `./temp/${type}`;

    console.log(`Starting download of type ${type}`);

    await fs.remove(directory);
    await fs.ensureDir(directory);

    await this.page.waitForNavigation({ waitUntil: 'networkidle0' });

    await (this.page as any)._client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: directory,
    });

    await this.page.select('#report-type', typeMap[type]);
    await this.page.select('#report-month-start', '1');
    await this.page.select('#report-day-start', '1');
    await this.page.select('#report-year-start', '2019');
    await this.page.click('#report-use-today');

    await this.page.click('#report-confirm');

    console.log('Waiting for file to download');
    const file = await this.getFileName(`./temp/${type}/*.csv`);

    if (file === undefined) {
      return;
    }

    // TODO: improve this
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const { size } = await fs.stat(file);

    if (size === 0) {
      throw new Error(`\n\n⚠️   ⚠️   File ${file} had zero bytes!   ⚠️   ⚠️\n\n`);
    }

    console.log('Copying file');
    await fs.copy(file, `./data/amazon-${type}.csv`, { overwrite: true });

    console.log(`Removing ${directory}`);
    await fs.remove(directory);
  }

  private getAmazonCredentials() {
    const { AMAZON_USERNAME, AMAZON_PASSWORD } = process.env;

    if (!AMAZON_USERNAME || !AMAZON_PASSWORD) {
      throw new Error(
        '☠️   ☠️   ☠️   - Your Amazon username and password are required to run this update.'
      );
    }

    return { AMAZON_USERNAME, AMAZON_PASSWORD };
  }

  private async getFileName(
    globPattern: string,
    maxWait = 30000,
    waitInterval = 1000
  ): Promise<string | undefined> {
    let totalWait = 0;
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        totalWait += waitInterval;
        const files: string[] = await globby(globPattern);

        if (files.length === 1) {
          clearInterval(interval);

          resolve(files[0]);
        } else if (totalWait > maxWait) {
          clearInterval(interval);
          reject('File wait timeout');
        }
      }, waitInterval);
    });
  }
}
