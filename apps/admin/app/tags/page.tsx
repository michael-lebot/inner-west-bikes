import { listRecentTags } from '@iwb/db'
import { dateTime, OPERATORS, PROBLEMS } from '@iwb/shared'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Tags' }

const COLUMNS = ['Status', 'Live', 'Suburb', 'Street', 'Operator', 'Problem', 'Created', 'Expires']

export default async function TagsPage() {
  const tags = await listRecentTags()

  return (
    <>
      <h1 className="text-2xl font-bold">Tags</h1>
      <p className="mt-1 text-sm text-muted">The latest {tags.length} tags, newest first.</p>
      <table className="mt-4 text-left text-sm">
        <thead>
          <tr className="border-b border-edge">
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="py-2 pr-4">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tags.map((tag) => (
            <tr key={tag.id} className="border-b border-line">
              <td className="py-2 pr-4">{tag.status}</td>
              <td className="py-2 pr-4">{tag.live ? 'Yes' : 'No'}</td>
              <td className="py-2 pr-4">{tag.suburb}</td>
              <td className="py-2 pr-4">{tag.street}</td>
              <td className="py-2 pr-4">{OPERATORS[tag.operator].label}</td>
              <td className="py-2 pr-4">{PROBLEMS[tag.problem]}</td>
              <td className="py-2 pr-4">{dateTime(tag.createdAt)}</td>
              <td className="py-2 pr-4">{dateTime(tag.expiresAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
