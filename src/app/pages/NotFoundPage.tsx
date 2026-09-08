import { Link } from '../router'
import { EmptyState } from '../components/ui'
import { IconWarning } from '../components/icons'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<IconWarning size={20} />}
      title="Page not found"
      description="That route is not part of the dashboard."
      action={
        <Link to="/replays" className="btn-primary">
          Go to replays
        </Link>
      }
    />
  )
}
