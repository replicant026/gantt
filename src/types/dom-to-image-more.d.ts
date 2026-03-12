declare module "dom-to-image-more" {
  interface Options {
    width?: number;
    height?: number;
    scale?: number;
    backgroundColor?: string;
    cacheBust?: boolean;
    useCORS?: boolean;
    skipFonts?: boolean;
    imagePlaceholder?: string;
    filter?: (node: Node) => boolean;
  }

  function toPng(node: HTMLElement, options?: Options): Promise<string>;
  function toBlob(node: HTMLElement, options?: Options): Promise<Blob>;
  function toJpeg(node: HTMLElement, options?: Options): Promise<string>;
}
