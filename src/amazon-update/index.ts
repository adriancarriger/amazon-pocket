import AmazonService from './amazon.service';

(async () => {
  console.log('Starting update 🤖');

  await downloadType('items');
  await downloadType('orders');
  await downloadType('refunds');

  console.log('Update complete 🙂');
})().catch(console.error);

async function downloadType(type: 'items' | 'orders' | 'refunds') {
  const amazon = new AmazonService();
  await amazon.setupBrowser();
  await amazon.login();
  await amazon.downloadType(type);
  await amazon.closeBrowser();
}
