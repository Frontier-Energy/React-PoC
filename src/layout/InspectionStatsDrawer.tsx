import { Box, Header, SpaceBetween, Table } from '@cloudscape-design/components';
import { type Labels } from '../resources/translations';
import { UploadStatus } from '../types';

interface InspectionStatsDrawerProps {
  labels: Labels;
  statsItems: Array<{
    status: UploadStatus;
    label: string;
    count: number;
  }>;
}

export function InspectionStatsDrawer({ labels, statsItems }: InspectionStatsDrawerProps) {
  return (
    <SpaceBetween size="s">
      <Header variant="h3">{labels.inspectionStats.header}</Header>
      <Table
        variant="embedded"
        trackBy="status"
        columnDefinitions={[
          {
            id: 'status',
            header: labels.inspectionStats.statusHeader,
            cell: (item) => item.label,
          },
          {
            id: 'count',
            header: labels.inspectionStats.countHeader,
            cell: (item) => item.count,
          },
        ]}
        items={statsItems}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{labels.inspectionStats.empty}</b>
          </Box>
        }
      />
    </SpaceBetween>
  );
}
