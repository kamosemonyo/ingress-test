import { readFileSync, PathLike } from 'fs';
import { load } from 'js-yaml';
import { ENV_PRE, ENV_PROD } from '../lib/constants';
import { Service } from './service';

export class ServiceBuilder {
  private static filepath:PathLike = './service/projects.yml';

  static buildServices (env:string = ENV_PRE):Service[] {
    if (env !== ENV_PRE && env !== ENV_PROD) {
      env = ENV_PRE
    }

    const config:any = this.readConfig()
    const services:Service[] = [];

    for (const service of config.services) {
      const templateService = new Service({
        name: service.name,
        replicas: service.replicas,
        propertiesFile: service.propertiesFile,
        branches: service.branches,
        template: service.template,
        host: service.host
      });

      services.push(templateService);
    }

    return services;
  }
  
  static getReplicas (env:string, service:any) {
    return (env == ENV_PRE) ? service.replicas.pre : service.replicas.prod;
  }

  static readConfig ():any {
    const ymlString = readFileSync(this.filepath, { encoding: 'utf-8' })
    const serviceConfig = load(ymlString)
    return serviceConfig
  }
}