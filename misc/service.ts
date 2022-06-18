export interface ServiceProps {
  name:string;
  replicas:Number;
  propertiesFile:string;
  branches:string[];
  template:string;
  host?:string;
}

export class Service {
  name:string;
  replicas:Number;
  propertiesFile:string;
  branches:string[];
  template:string;
  host?:string;

  constructor(props:ServiceProps) {
    this.name = props.name;
    this.replicas = props.replicas;
    this.propertiesFile = props.propertiesFile;
    this.branches = props.branches;
    this.template = props.template;
    this.host = props.host;
  }
  
}