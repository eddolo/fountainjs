/** Internal inert XML shape shared by the DOCX parser and format adapters. */
export type XMLChild = XMLElement | string;
export interface XMLElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: XMLChild[];
  readonly namespaces: Readonly<Record<string, string>>;
}
