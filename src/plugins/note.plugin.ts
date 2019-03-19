import { SimplePlugin } from '../simple.plugin';

export class NotePlugin extends SimplePlugin {
  public name = 'Note';

  constructor() {
    super();
    this.prepareRules();
  }

  public updateRow(row, newValue) {
    row.note = newValue;
  }
}
