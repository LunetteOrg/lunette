import { Links, Meta, Outlet, Scripts } from 'react-router'

// The document every route renders into. React Router expects it, and the
// example keeps it to the minimum that makes a real route module real.
export default function Root() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
