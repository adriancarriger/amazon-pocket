export abstract class SimplePlugin {
  public name;
  public types = ['original_payee', 'payee', 'note', 'amount', 'custom'];
  private rules = [];
  private customMatchFunctionsMap = {
    amount: this.amountMatch,
    custom: this.customMatch,
  };

  public needsUpdate(row) {
    for (let ruleIndex = 0; ruleIndex < this.rules.length; ruleIndex++) {
      const rule = this.rules[ruleIndex];
      for (let typeIndex = 0; typeIndex < this.types.length; typeIndex++) {
        const matchType = this.types[typeIndex];
        if (matchType in rule) {
          const ruleFunction = this.getRuleFunction(matchType);

          if (ruleFunction(row, matchType, rule[matchType])) {
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
    const rules = require(`./rules/${this.name.toLowerCase()}.rules`).default;
    this.rules = rules.map((rule) => {
      const preparedRule = { ...rule };

      this.types.forEach((type) => {
        if (type in rule && !(type in this.customMatchFunctionsMap)) {
          preparedRule[type] = rule[type].map((typeItem) => typeItem.toLowerCase());
        }
      });

      return preparedRule;
    });
  }

  public updateRow(row, newValue) {}

  private getRuleFunction(matchType) {
    return matchType in this.customMatchFunctionsMap
      ? this.customMatchFunctionsMap[matchType]
      : this.stringMatch;
  }

  private stringMatch(row, matchType, matchOptions: string[]) {
    const rowValue: string = row[matchType];

    if (!rowValue) {
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

  private amountMatch(row, matchType, matchAmount: number) {
    const amount: string = row[matchType];
    Number(amount) === matchAmount;
  }

  private customMatch(row, _, matchFunction) {
    return matchFunction(row);
  }
}
