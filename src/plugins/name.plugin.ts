import { SimplePlugin } from '../simple.plugin';

export class NamePlugin extends SimplePlugin {
  public name = 'Name';

  constructor() {
    super();
    this.prepareRules();
  }

  public updateRow(row, newValue) {
    row.payee = newValue;
  }
}
