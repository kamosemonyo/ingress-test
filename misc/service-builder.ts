import { readFileSync, PathLike } from 'fs';
import { load } from 'js-yaml';

export class ServiceBuilder {
  private static filepath:PathLike = './misc/projects.yml';

  static buildJavaServices () {
    const config:any = this.readConfig()
    return config.services;
  }

  static readConfig () {
    const ymlString = readFileSync(this.filepath, { encoding: 'utf-8' })
    const serviceConfig = load(ymlString)
    return serviceConfig
  }
}