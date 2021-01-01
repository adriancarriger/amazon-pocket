import { addTag } from './mutation-functions';

export interface Row {
  id: number;
  sharedPluginData?: { parsedDate?: Date; split?: boolean; amazonCateogry?: string };
  splitItems: Row[];
  tags: string[];
  note: string;
  payee: string;
  date: string;
  amount: number;
  original_payee: string;
  category_title: string;
}

export interface Rule {
  newValue?: string;
  refs?: string[];
  name?: string;
  category?: string;
  label?: string[];
  checks?: number[];
  note?: string[];
  custom?: (row: Row) => boolean;
  payee?: string[];
  original_payee?: string[];
}

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
