export interface OLTTemplate {
  [action: string]: {
    description: string;
    commands: string[];
  };
}
