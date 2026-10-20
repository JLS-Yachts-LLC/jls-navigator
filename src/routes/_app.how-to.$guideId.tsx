import { createFileRoute } from "@tanstack/react-router";
import { HowToGuidePage } from "@/components/how-to/how-to-pages";
import { guideById } from "@/lib/how-to/guides";

export const Route = createFileRoute("/_app/how-to/$guideId")({
  component: GuideRoute,
  head: ({ params }) => ({ meta: [{ title: `${guideById(params.guideId)?.title ?? "How-to Guide"} — Polaris` }] }),
});

function GuideRoute() {
  const { guideId } = Route.useParams();
  return <HowToGuidePage guideId={guideId} />;
}
