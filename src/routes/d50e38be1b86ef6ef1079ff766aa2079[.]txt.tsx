import { createFileRoute } from "@tanstack/react-router";
import { INDEXNOW_KEY } from "@/lib/indexnow";

// Served at /<key>.txt — IndexNow's ownership check. Submitting a URL list is
// only accepted when this file exists at the host root and contains the same
// key that the submission carries.
//
// The key is public by design, not a credential. Anyone who reads it can
// announce URLs on this host and nothing else, which is why the spec has you
// publish it. The filename must equal the key, so rotating means renaming
// this file and updating the constant together.
export const Route = createFileRoute("/d50e38be1b86ef6ef1079ff766aa2079.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(INDEXNOW_KEY, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        }),
    },
  },
});
