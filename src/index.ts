import PocketService from './pocket.service';
import RulesEngine from './rules.engine';
import getPlugins from './plugins';

const pocket = new PocketService();

(async () => {
  const rules = new RulesEngine(await getPlugins());

  console.log('Starting update 🤖');

  await pocket.setupBrowser();
  await pocket.login();
  const transactions = await pocket.getTransactions();
  const updates = await rules.apply(transactions);

  await pocket.sendUpdates(updates);
  await pocket.closeBrowser();

  console.log('Update complete 🙂');
})().catch(error => {
  console.error(error);

  return pocket.closeBrowser();
});
