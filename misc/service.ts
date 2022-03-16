export class Service {
  name:string;
  replicas:Number;
  propertiesFile:string;
  branches:string[];

  constructor(name:string, replicas:Number, propertiesFile:string, branches:string[]) {
    this.name = name;
    this.replicas = replicas;
    this.propertiesFile = propertiesFile;
    this.branches = branches;
  }
}

export class JavaService extends Service {

  constructor(name:string, replicas:Number, propertiesFile:string, branches:string[]) {
    super(name, replicas, propertiesFile, branches);
  }
}