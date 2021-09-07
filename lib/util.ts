import { CfnParameter } from "@aws-cdk/core";

export const toValidConstructName = (id: string) => {
  let str = id.split('_').join('-');

  return str.split('-')
  .map(w => w[0].toUpperCase() + w.substr(1).toLowerCase())
  .join('-');
};
