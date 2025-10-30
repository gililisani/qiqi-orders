// components
import LightTimeline from "./components/light-timeline";
import DarkTimeline from "./components/dark-timeline";

export default function TimelinePage() {
  return (
    <div className="tw-mt-8 tw-mb-4 tw-grid tw-gap-6 md:tw-grid-cols-1 lg:tw-grid-cols-2">
      <LightTimeline />
      <DarkTimeline />
    </div>
  );
}
