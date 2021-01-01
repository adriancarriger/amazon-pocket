import { Row } from '../rules.engine';
import { SimplePlugin } from '../simple.plugin';

export class NamePlugin extends SimplePlugin {
  public name = 'Name';

  constructor() {
    super();
    this.prepareRules();
  }

  public updateRow(row: Row, newValue: string) {
    row.payee = newValue;
  }
}
