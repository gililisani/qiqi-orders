'use client';

import { useParams } from 'next/navigation';
import { SLIDocumentView } from '../../../../components/shared/SLIDocumentView';

export default function StandaloneSLIPreviewPage() {
  const params = useParams();
  const sliId = params.id as string;

  return (
    <SLIDocumentView
      dataUrl={`/api/sli/${sliId}/data`}
      backUrl="/admin/sli/documents"
      backLabel="Back to SLI documents"
      editHref={`/admin/sli/${sliId}/edit`}
    />
  );
}
