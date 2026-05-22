import { assertEquals } from "@std/assert";
import { renderMultistatusXml } from "./webdav-xml.ts";

Deno.test("renderMultistatusXml renders file and collection resources", () => {
  const xml = renderMultistatusXml({
    resources: [
      {
        href: "/script.user.js",
        lastModified: new Date("2024-01-02T03:04:05.000Z"),
        size: 12,
        isCollection: false,
      },
      {
        href: "/Tampermonkey/sync",
        lastModified: new Date("2024-01-02T03:04:06.000Z"),
        size: 0,
        isCollection: true,
      },
    ],
    cursor: 42,
  });

  assertEquals(
    xml,
    [
      '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:td="http://dav.tampermonkey.net/ns"><d:response>',
      "<d:href>/script.user.js</d:href>",
      "<d:propstat>",
      "<d:prop>",
      "<d:getlastmodified>2024-01-02T03:04:05.000Z</d:getlastmodified>",
      "<d:resourcetype />",
      "<d:getcontentlength>12</d:getcontentlength>",
      "</d:prop>",
      "<d:status>HTTP/1.1 200 OK</d:status>",
      "</d:propstat>",
      "</d:response>",
      "<d:response>",
      "<d:href>/Tampermonkey/sync</d:href>",
      "<d:propstat>",
      "<d:prop>",
      "<d:getlastmodified>2024-01-02T03:04:06.000Z</d:getlastmodified>",
      "<d:resourcetype><d:collection/></d:resourcetype>",
      "<d:getcontentlength />",
      "</d:prop>",
      "<d:status>HTTP/1.1 200 OK</d:status>",
      "</d:propstat>",
      "</d:response><td:cursor>42</td:cursor></d:multistatus>",
    ].join("\n"),
  );
});
