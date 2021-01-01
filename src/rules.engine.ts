import { addTag } from './mutation-functions';

export default class RulesEngine {
  constructor(private plugins = []) {}

  public async apply(rows) {
    const updates = [];
    rows.forEach((row) => {
      const rowCopy = JSON.stringify(row);
      let needsUpdate = false;
      row.sharedPluginData = {};

      if (!row.tags) {
        row.tags = [];
      }

      this.plugins.forEach((plugin) => {
        (row.splitItems || [row]).forEach((splitItem) => {
          if (plugin.needsUpdate(splitItem)) {
            needsUpdate = true;
          }
        });
      });

      delete row.sharedPluginData;

      if (needsUpdate && rowCopy !== JSON.stringify(row)) {
        addTag(row, 'ΔBot');
        updates.push(row);
      }
    });

    return updates;
  }
}
