import { Row } from '../rules.engine';
import { SimplePlugin } from '../simple.plugin';
import { addTag } from '../mutation-functions';

export class LabelPlugin extends SimplePlugin {
  public name = 'Label';

  constructor() {
    super();
    this.prepareRules();
  }

  public updateRow(row: Row, newValues: string[]) {
    newValues.forEach((newValue) => addTag(row, newValue));
  }
}
