import { readFileSync, PathLike } from 'fs';
import { load } from 'js-yaml';
import { JavaService, Service } from './service';

export class ServiceBuilder {
  private static filepath:PathLike = './misc/projects.yml';

  static buildJavaServices ():Service[] {
    const config:any = this.readConfig()
    const services:Service[] = [];

    for (const service of config.services) {
      const jService = new JavaService(
        service.name,
        service.replicas,
        service.propertiesFilePath,
        service.branches
      );
      
      services.push(jService);
    }

    return services;
  }

  static readConfig () {
    const ymlString = readFileSync(this.filepath, { encoding: 'utf-8' })
    const serviceConfig = load(ymlString)
    return serviceConfig
  }
}