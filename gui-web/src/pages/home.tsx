/**
 * Home Page — Dashboard with stats and quick actions
 */

import { Button, Card } from '@/components/ui'

export function HomePage() {
  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-bold text-foreground">Home</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <Card.Header>
            <Card.Title>Profiles</Card.Title>
            <Card.Description>Manage agent configurations</Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="text-2xl font-bold text-foreground">0</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="ghost" size="sm">View all →</Button>
          </Card.Footer>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Library</Card.Title>
            <Card.Description>Providers & templates</Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="text-2xl font-bold text-foreground">0</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="ghost" size="sm">View all →</Button>
          </Card.Footer>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Sessions</Card.Title>
            <Card.Description>Active agent sessions</Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="text-2xl font-bold text-foreground">0</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="ghost" size="sm">View all →</Button>
          </Card.Footer>
        </Card>
      </div>
    </div>
  )
}
