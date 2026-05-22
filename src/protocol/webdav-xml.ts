export type MultistatusResource = {
  href: string;
  lastModified: Date;
  size: number;
  isCollection: boolean;
};

export function renderMultistatusXml(
  { resources, cursor }: {
    resources: MultistatusResource[];
    cursor?: number;
  },
) {
  const items = resources.map(renderResourceXml);
  const cursorXml = cursor ? `<td:cursor>${cursor}</td:cursor>` : "";
  return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:td="http://dav.tampermonkey.net/ns">${
    items.join("\n")
  }${cursorXml}</d:multistatus>`;
}

function renderResourceXml(resource: MultistatusResource) {
  return [
    "<d:response>",
    `<d:href>${resource.href}</d:href>`,
    "<d:propstat>",
    "<d:prop>",
    `<d:getlastmodified>${resource.lastModified.toISOString()}</d:getlastmodified>`,
    resource.isCollection
      ? "<d:resourcetype><d:collection/></d:resourcetype>"
      : "<d:resourcetype />",
    resource.isCollection
      ? "<d:getcontentlength />"
      : `<d:getcontentlength>${resource.size}</d:getcontentlength>`,
    "</d:prop>",
    "<d:status>HTTP/1.1 200 OK</d:status>",
    "</d:propstat>",
    "</d:response>",
  ].join("\n");
}
