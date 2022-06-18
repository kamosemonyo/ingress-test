import { ENV_PRE, ENV_PROD, KONG_DEV_TAG, KONG_PRE_TAG, KONG_PROD_TAG } from "./constants";

export const toValidConstructName = (id: string) => {
  let str = id.split('_').join('-');

  return str.split('-')
  .map(w => w[0].toUpperCase() + w.substr(1).toLowerCase())
  .join('-');
};

export function getKongTagVersion (environment:string):string {
  if (environment == ENV_PROD) {
    return KONG_PROD_TAG
  } else if (environment == ENV_PRE) {
    return KONG_PRE_TAG
  } else {
    return KONG_DEV_TAG
  }
}