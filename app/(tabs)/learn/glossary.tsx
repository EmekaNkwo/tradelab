import { router } from 'expo-router';
import { useState } from 'react';
import { EmptyState, ListRow, ListScreen, TextField } from '../../../components/ui';
import { BookOpen } from '../../../components/ui/icons';
import { useGlossarySearch } from '../../../features/tools';

export default function GlossaryScreen() {
  const [query, setQuery] = useState('');
  const items = useGlossarySearch(query);
  return (
    <ListScreen
      testID="glossary-screen"
      header={<TextField label="Search terms" value={query} onChangeText={setQuery} placeholder="e.g. spread" testID="glossary-search" autoCapitalize="none" />}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={(item) => (
        <ListRow testID={`term-${item.id}`} icon={BookOpen} iconTone="neutral" title={item.term} subtitle={item.summary} onPress={() => router.push({ pathname: '/glossary/[id]', params: { id: item.id } })} />
      )}
      empty={<EmptyState title="No matching terms" body="Try a shorter word, or check the spelling." />}
    />
  );
}
