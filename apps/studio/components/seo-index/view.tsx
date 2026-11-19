import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Stack,
  Text,
} from "@sanity/ui";
import { getStudioSearchConfig } from "@workspace/env/studio";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { getPublishedId } from "sanity";
import type { UserViewComponent } from "sanity/structure";

import {
  indexAssessment,
  previewUrl,
  type SeoDocument,
  seoPreview,
} from "./model";
import { readIndexMembership } from "./read-index";

const config = getStudioSearchConfig();
type Status = {
  key: string;
  state: "loading" | "error" | "ready";
  found?: boolean;
  checkedAt?: string;
};

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <Flex align="center" gap={3}>
      <Badge tone={ok ? "positive" : "caution"}>{ok ? "Pass" : "Check"}</Badge>
      <Text size={1}>{text}</Text>
    </Flex>
  );
}

export function SeoIndexView({
  document,
  documentId,
}: ComponentProps<UserViewComponent>) {
  // displayed includes the current editor state; fetching a saved document here
  // would lag behind typing. published is used separately for sync expectations.
  const displayed = document.displayed as SeoDocument;
  const published = document.published as SeoDocument | null;
  const preview = seoPreview(displayed);
  const id = getPublishedId(documentId);
  const revision = document.published?._rev;
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${id}:${revision ?? ""}:${refresh}`;
  const [status, setStatus] = useState<Status>({
    key: requestKey,
    state: "loading",
  });

  useEffect(() => {
    if (!config.success) return;
    const controller = new AbortController();
    setStatus({ key: requestKey, state: "loading" });
    readIndexMembership(config.data, id, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted)
          setStatus({
            key: requestKey,
            state: "ready",
            found,
            checkedAt: new Date().toLocaleTimeString(),
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus({ key: requestKey, state: "error" });
      });
    return () => controller.abort();
  }, [id, requestKey]);

  const current: Status =
    status.key === requestKey ? status : { key: requestKey, state: "loading" };
  const draftNoIndex =
    preview.noIndex && !published?.seoNoIndex && current.found;
  return (
    <Box padding={4}>
      <Stack gap={5}>
        <Heading size={2}>SEO &amp; Index</Heading>
        <Text size={1} muted>
          Preview and checks follow the displayed document. Index expectations
          use its published version.
        </Text>
        
        <Card border padding={4} radius={2}>
          <Stack gap={3}>
            <Heading size={1}>Search preview</Heading>
            <Text size={1} muted>
              {previewUrl(
                process.env.SANITY_STUDIO_PRESENTATION_URL,
                displayed.slug?.current
              )}
            </Text>
            <div
              style={{
                color: "var(--card-link-color)",
                fontSize: 22,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {preview.title || "Untitled post"}
            </div>
            <div
              style={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
                lineHeight: 1.5,
              }}
            >
              {preview.description || "No description set."}
            </div>
            <Text size={1} muted>
              Approximate appearance; search engines may rewrite or truncate
              text differently.
            </Text>
          </Stack>
        </Card>
        <Stack gap={4}>
          <Heading size={1}>Checks</Heading>
          <Check
            ok={preview.titleSet}
            text={`Meta title ${preview.titleSet ? "set" : "missing"} — ${preview.title.length} characters. No schema title limit.`}
          />
          <Check
            ok={preview.descriptionValid}
            text={`Description: ${preview.description.length} characters — ${preview.descriptionValid ? "within" : "outside"} the schema's 140–160 range.`}
          />
          <Check
            ok={preview.hasImage}
            text={
              preview.hasImage
                ? "Image set (SEO override or main image)."
                : "No SEO image or main image set."
            }
          />
          <Check
            ok={!preview.noIndex}
            text={
              preview.noIndex
                ? "Do Not Index is enabled in the displayed document."
                : "Search engine indexing is allowed in the displayed document."
            }
          />
        </Stack>
        <Card border padding={4} radius={2}>
          <Stack gap={4}>
            <Flex align="center" justify="space-between" gap={3}>
              <Heading size={1}>Search index</Heading>
              <Button
                text="Refresh index status"
                mode="ghost"
                disabled={!config.success || current.state === "loading"}
                onClick={() => setRefresh((value) => value + 1)}
              />
            </Flex>
            <Text size={1} muted>
              Object ID: {id}
            </Text>
            <IndexResult current={current} published={published} />
            {draftNoIndex && (
              <Card padding={3} tone="caution">
                <Text size={1}>
                  The displayed version has Do Not Index enabled, but the
                  published version does not. It is still in Algolia; publish
                  this change to remove it.
                </Text>
              </Card>
            )}
            {current.checkedAt && (
              <Text size={1} muted>
                Last checked: {current.checkedAt}. Indexing is asynchronous;
                refresh after a few seconds following publication.
              </Text>
            )}
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}

function IndexResult({
  current,
  published,
}: {
  current: Status;
  published: SeoDocument | null;
}) {
  if (!config.success)
    return (
      <Text size={1}>
        Configure SANITY_STUDIO_ALGOLIA_APP_ID, SANITY_STUDIO_ALGOLIA_INDEX_NAME
        and SANITY_STUDIO_ALGOLIA_SEARCH_KEY, then restart or redeploy Studio.
        Use a search-only key.
      </Text>
    );
  if (current.state === "loading")
    return <Text size={1}>Checking Algolia…</Text>;
  if (current.state === "error")
    return (
      <Card padding={3} tone="caution">
        <Text size={1}>
          Could not check Algolia. Verify the search-only key, index name and
          connection. Membership is unknown.
        </Text>
      </Card>
    );
  const assessment = indexAssessment(published, current.found === true);
  return (
    <Card padding={3} tone={assessment.tone}>
      <Text size={1}>{assessment.message}</Text>
    </Card>
  );
}
