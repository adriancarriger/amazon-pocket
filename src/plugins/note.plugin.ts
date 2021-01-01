import { Row } from '../rules.engine';
import { SimplePlugin } from '../simple.plugin';

export class NotePlugin extends SimplePlugin {
  public name = 'Note';

  constructor() {
    super();
    this.prepareRules();
  }

  public updateRow(row: Row, newValue: string) {
    row.note = newValue;
  }
}
