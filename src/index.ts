import * as fs from 'fs-extra';

import PocketService from './pocket.service';
import RulesEngine from './rules.engine';
import getPlugins from './plugins';

const useLocalData = false;
const transactionsCache = './data/pocket-transactions.json';

const pocket = new PocketService();

(async () => {
  const rules = new RulesEngine(await getPlugins());

  console.log('Starting update 🤖');

  if (!useLocalData) {
    await pocket.setupBrowser();
    await pocket.login();
  }

  const transactions = await getTransactions();

  if (!useLocalData) {
    await fs.writeJSON(transactionsCache, transactions);
  }

  const updates = await rules.apply(transactions);

  if (!useLocalData) {
    await pocket.sendUpdates(updates);
    await pocket.closeBrowser();
  }

  console.log('Update complete 🙂');
})().catch(error => {
  console.error(error);

  if (!useLocalData) {
    return pocket.closeBrowser();
  }
});

async function getTransactions() {
  return useLocalData ? fs.readJson(transactionsCache) : pocket.getTransactions();
}
