import { SimplePlugin } from '../simple.plugin';
import { addTag } from '../mutation-functions';

export class LabelPlugin extends SimplePlugin {
  public name = 'Label';

  constructor() {
    super();
    this.prepareRules();
  }

  public updateRow(row, newValues) {
    newValues.forEach((newValue) => addTag(row, newValue));
  }
}
