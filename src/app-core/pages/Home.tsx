import { Header } from '@cloudscape-design/components';
import { useLocalization } from '../LocalizationContext';

export function Home() {
  const { labels } = useLocalization();
  return <Header variant="h1">{labels.home.title}</Header>;
}
