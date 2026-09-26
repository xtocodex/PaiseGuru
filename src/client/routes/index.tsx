import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <h1 className="p-4 text-xl font-semibold">PaiseGuru</h1>,
})
