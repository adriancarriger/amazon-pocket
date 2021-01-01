import { Row, Rule } from './rules.engine';

export abstract class SimplePlugin {
  public name: string;
  public types = ['original_payee', 'payee', 'note', 'amount', 'custom'];
  private rules: Rule[] = [];
  private customMatchFunctionsMap = {
    amount: this.amountMatch,
    custom: this.customMatch,
  };

  public needsUpdate(row: Row) {
    for (let ruleIndex = 0; ruleIndex < this.rules.length; ruleIndex++) {
      const rule = this.rules[ruleIndex];
      for (let typeIndex = 0; typeIndex < this.types.length; typeIndex++) {
        const matchType = this.types[typeIndex];
        if (matchType in rule) {
          const ruleFunction = this.getRuleFunction(matchType as any);

          if (ruleFunction(row, matchType, rule[matchType as keyof Rule])) {
            if (rule.newValue) {
              this.updateRow(row, rule.newValue);
            }

            return true;
          }
        }
      }
    }
  }

  public prepareRules() {
    const rules: Rule[] = require(`./rules/${this.name.toLowerCase()}.rules`).default;
    this.rules = rules.map((rule) => {
      const preparedRule = { ...rule };

      this.types.forEach((type) => {
        if (type in rule && !(type in this.customMatchFunctionsMap)) {
          (preparedRule as any)[type] = ((rule as any)[type] as string[]).map((typeItem) =>
            typeItem.toLowerCase()
          );
        }
      });

      return preparedRule;
    });
  }

  public updateRow(row: Row, newValue: string | string[]) {}

  private getRuleFunction(matchType: keyof Row | 'custom' | 'amount') {
    return matchType in this.customMatchFunctionsMap
      ? (this.customMatchFunctionsMap as any)[matchType]
      : this.stringMatch;
  }

  private stringMatch(row: Row, matchType: keyof Row, matchOptions: string[]) {
    const rowValue = row[matchType];

    if (!rowValue || typeof rowValue !== 'string') {
      return false;
    }

    const value = rowValue.toLowerCase();
    for (let matchOptionIndex = 0; matchOptionIndex < matchOptions.length; matchOptionIndex++) {
      const matchOption = matchOptions[matchOptionIndex];

      if (value.includes(matchOption)) {
        return true;
      }
    }
  }

  private amountMatch(row: Row, matchType: keyof Row, matchAmount: number) {
    Number(row[matchType]) === matchAmount;
  }

  private customMatch(row: Row, _: string, matchFunction: Rule['custom']) {
    return matchFunction?.(row);
  }
}
