# Application Prompt — ADA Agency Job Tracker

## Purpose and core concept
- This is a new project I want to create in the jobtracker GitHub.
- This is a job tracker for the American Dental association agency group that does marketing for the organization, investigate and understand the organization and its goals
- Review and refer to all of the example material in GitHub. There are a number of useful documents there There is a conversation between Kevin and Lee that discusses the requirements. Learn and understand all of these deeply
- Review the sample material provided and incorporate all of the requirements and need into the application and design.
- This is in the end a a console to manage and operate the job status.
- We want to be able to manage them completely, end to end

## Look and feel
- Navigation, look, and feel should be similar to Relay and manager
- Mimic the overall look and feel generally, but update the color scheme a touch so it is different while staying in the same look and feel
- Options for modes include ADA dark ada light, polecat dark and polecat light, use the attached ADA style guide for colors fonts and styles.
- The default mode for the application should be ada dark, and maybe also you could have system for that as well so its probably 6 modes ada light, dark, system and polecat light, dark and system- Keep the application simple, elegant, and an absolute joy to use.
- Super easy for beginners and incredibly powerful for advanced users.
- Easy to learn and use quickly, using modern best design practices.
- Should be a true delight, with a fun, game-like sensibility, animations, graphics, flows, and activity.
- Should be exceptional in its design and best-practice visual design, with a human-oriented design philosophy.
- As you implement it, you may improve on the design.
- If you have an improved look and feel, chrome, and design, you may implement that as well.


## Dashboard home page
- On the dashboard home page I want to see the recent, latest jobs I am working on, and popular, and favorites, and interesting stats and links to key items
- Each project tile should show key stats, such as when it was last updated (ct), and maybe a snippet or some assessment of the project from the repository, include useful information here
- Clicking or linking on a tile should take me to details: the what's new, what is the latest, and all of the previous entries as well.
- Be innovative here and use visual design and project best practices to make this elegant and compelling

## Job inventory
- I want to see the statuses of the project
- For the inventory of active jobs there should be filtering and sorting, probably easy pill filters for status and a few other key elements, dont make this too messy with too many statyses
- A delightful interative list of all of the jobs
- Want to be able to create and save and edit views that are names and have certain columns and filters applied. These should also be exportable as excel, csv, other popular formats
- use best practices here for interaction with the list and how to manage and edit and interact on this screen

## Job editing
- There should be the ability to edit the field data and on this screen
- This then is the main tracking and review edit screen so you should be able to see and edit and review the full job details, make this experience very cool and fun, like use visuals and animations and date pickers and pick lists etc
- It should be created with filters, sorting, and customization of the attributes tracked.
- You should be able to manage the values available in the pick list both in the UI there as well as manage all of the metadata values in a settings or references type area. Use best practice naming and techniques for what I am describing
- Also there should be link sharing so one could copy a link to a job and then a person with that link could go directly to the very cool editing page
- I like how you have icons for each job, make sure you include a robust set of icons for the marketing purposes at hand, ideally you could like the type of thing that is being made already so the icon but also let people change them and give guidance on the kinds of icons supported or what looks good
- Include the ability add one or more file attachments to upload them to the job and eventually you should add a document library to the application where you have full management to upload remove organize tag, etc
- Define allowed file extensions (e.g., PDF, JPG, DOCX) and maximum file size limits to prevent the system from being used to host malware or massive files that drain storage.
- use best practices here for interaction with this and how to manage and edit and interact on this screen

## Data import
- also the example includes detailed seed data, include the ability to import data in your preferred application json format, but also allow importing of the excel spreadsheet example of what is in there, use the spreadsheet exactly as provided if possible and/or also allow importing and mapping of the columns and data to your end job repository, like an import wizard
- also we want the ability to import data directly from a microsoft form, you may need to handle authentication and/or also allow importing from an export from microsoft forms, like this is a job import
- use best practices here for interaction with this and how to manage and work and interact on this screen

## Configuration and credentials
- For setting up the application's projects there should be a place for configurations and credentials.
- Ideally set them up once if they are shared across projects.
- Otherwise set them up within a specific project if the credentials belong to that project.

## Metrics and status reporting
- Would be nice to have a left menu nav option that allows quick stats and links back to projects or other tabs or views, these are maybe some of the same tiles on the home page and wheee possible uses elements from the analytics polecat live project and also note the observability panel on the model server for ideas

## Access control and admin mode
- Put this behind a locked, invite-only, admin-token access-based approach like Relay does.
- Generate for me an admin token.
- Generate for me a user token as well.
- Include that whole admin-mode notion.
- As admin, allow the creation of sharing links using the token.
- Those links should go directly to the app.

## Public marketing website
- Create a public website at the front, a marketing website extolling the features.
- for the public website you should use the overall branding and styles from the public website for relay or manager, but you can update the graphic styles accordingly.
- Use modern, sexy elements, animations, videos, and showcases.
- Make the website fun and intriguing.
- On the marketing page, include a link to the application, which is gated with the token.
- The tour should also show the token to copy and paste in as an admin.

## Onboarding and help
- Include a welcome tour that can be restarted or redone from settings.
- Provide a simple mode available in settings.
- Include complete documentation of the application for first-time users.
- Place the comprehensive user documentation in the left nav panel, and/or other areas that make sense. where appropriate link to the documentation in the application as needed

## Create and maintain on a regular basis the developer documentation, accessible in the documentation in settings
- README, etc
- architecture overview
- data model/schema
- storage and migration strategy
- import/export format
- security limitations
- future backend plan
- deployment notes for GitHub Pages and CNAME

## History
- Include history and undo.

## Versioning and data compatibility
- also add a switcher so that a person can go to the latest version by default or switch back to earlier versions. as you make things better and better in later versions, make sure that all local data is retained and not wiped on new deploy of the application and make sure all data is forward compatible and if possible, reverse compatible where you can, but don't prevent innovation to allow reverse compatibility, do this best you can
- default to the latest version, and this could be changed in settings to a prior version

## Technical constraints
- Build this only in HTML and JavaScript, no other languages or additions.
- This will eventually be backended by a service and/or a database like SQLite, so design accordingly.
- There should be an option available privacy in settings where you can configure to connect to against a remote database like sqllite or Postgres, there could be databases profiles that are included to allow connection to these, and the first time connecting it would inspect the source and it it not an empty source and it has the tables it needs it will connect otherwise it will ask if you want seed data in the database and you can create the back end data model repository schema for the system and also optionally sample seed data if asked, you can connect to multiple databases like Postgres or sqllite or even a remote file system and you can manage the data in the remote file system also as rows of data where you can manage the rows deleting etc.

## Documentation and code quality
- Project must be Well documented and well organized for humans keep the code clear and understandable, needs to be explained well

## Self-improvement loop, cadence, testing, and deployment
- Set up a routine or a GitHub Action that implements self-improvements to this on an hourly basis.
- Attempt to do a routine; set one up if you can.
- Otherwise, give me what is needed and I will try to set it up manually.
- Otherwise we will need to set up a GitHub Action, so be prepared for that.
- For each of your self-improvement iteration loops you can push directly to main so that the application goes immediately live.
- For every run you do, fill up your queue with items that will take about 30 to 45 minutes each.
- No small releases.
- Record the cadences of runs.
- For every 5 feature-based runs that you work against your roadmap, do a sweep of the application (running on /app) and the public website (running on main) and do graphic and feature and code refactor architecture performance and understandability improvements.
- For every 5 feature-based runs against your roadmap, do a sweep of the application on /app and the public website on main, be reflective on your progress, and continue to improve and update your roadmap with new, ambitious, groundbreaking, and fun ideas.
- At the end of every feature run, be sure that you deploy a battery of tests against the application.
- These tests should make sure the app completely functions and passes all tests.
- The app must be mobile-friendly and compatible; run this battery of tests at the end of every run.
- Ideally use standards and notion that will allow us to convert this to a mobile application in the future

## Data Persistence & Backend Architecture Roadmap
- **Architecture Philosophy:** The application will be built using a "Local-First" approach, starting as a pure HTML/JS Single Page Application (SPA) running entirely in the browser, with the ability to progressively connect to external backend services over time via settings.
## Phase 1 File & Attachment Handling (Local-First)
- **Storage Mechanism:** Because `localStorage` is limited to ~5MB of text-only data, the application must use the browser's `IndexedDB` API (or a lightweight wrapper like `localForage` or `idb`) to handle file attachments. `IndexedDB` natively supports binary data (`Blob`/`File` objects) and offers significantly larger storage limits.
- **Constraints & Limits:** To prevent the browser from running out of memory or aggressively clearing the local cache, enforce a strict per-file size limit (e.g., 10MB maximum) during Phase 1. 
- **Mock Upload Mode (UI Prototyping):** Include a setting to toggle "Mock File Uploads." When enabled, the app captures only the file's metadata (name, size, date, icon type) to populate the Document Library UI perfectly, without saving the actual binary weight to the browser.
- **Export Warnings:** When exporting a Job via JSON or CSV in Phase 1, the system must clearly warn the user that actual binary file attachments are not included in the text export and remain stored locally in their specific browser.
- **Phase 2: The API Bridge (Lightweight Server):**
  - Introduce a configuration option in Settings to "Connect to Remote Server."
  - Build a lightweight backend API (e.g., Node.js or Python) that exposes REST endpoints (`GET`, `POST`, `PUT`, `DELETE`).
  - The frontend will gracefully switch from reading/writing local storage to using `fetch()` calls against this API.
  - This server will act as the bridge to standard relational databases like SQLite or PostgreSQL.
- **Phase 3: Backend-as-a-Service (BaaS) Integration:**
  - Support connecting the frontend application to modern BaaS platforms (like Supabase or PocketBase).
  - This phase will handle advanced enterprise features: secure authentication tokens, robust role-based access control, and managed file storage buckets for job attachments.
- **Phase 4: Embedded / Edge Sync (Future Innovation):**
  - Explore embedding WebAssembly (Wasm) databases directly in the browser for high-performance offline caching that automatically syncs with the remote repository when the network is available.

## Infrastructure already in place
- I have set up a CLAUDE_CODE_OAUTH_TOKEN in the project.
- I have set up a CNAME in GoDaddy.
- Build and deployment source is a github action

## Job lifecycle and workflow
- Include a standard job workflow with statuses as described in the documents, which may include things like Requested, Briefed, In Progress, In Review, Revisions, Approved, Delivered/Published, Closed, but use the documents and reference materials provided as an assessment; statuses should be a managed pick list with sensible transitions and aging indicators for jobs stuck in a stage
- Include a job intake / new job request experience, this could even be a form and replacement for the microsoft forms eventually as the input 
- Auto-generate a job number for every job, follow the standards described in the samples that is visible and searchable everywhere, this should be editable and changable and should never duplicate
- Include a lightweight review and approval flow: request approval, record who approved and when, and track revision rounds; attachments should support versioning
- Include job types with templates (email campaign, print collateral, social, web banner, event materials, etc), each with type-specific fields and a default subtask checklist; job type also drives the default icon
- Allow jobs to be grouped into campaigns or programs with rollup status
- Include priority and rush flags, clone/duplicate job, bulk edit in the inventory, and global search

## People and assignment
- Every job should have a requester, owner, and assignee; include a "my jobs" style view and simple workload visibility
- Since access is strarting as token-based with no per-user login, manage team members as a simple managed list in settings (people as data), used for assignment, approvals, and comment attribution. We will want to eventually improve user setup and be able to link connect to external authentication providers

## Dates, views, and collaboration
- Jobs should have due dates, in-hands dates, and milestones, with overdue flagging
- In addition to the list view, include a kanban board view by status and a calendar view by due date
- Each job should have a comments/activity feed; keep this distinct from undo — history should include both an audit trail (who changed what, when) and undo (reverting changes)

## Clarifications for development
- The example spreadsheet defines the canonical job fields; extend but don't contradict it
- Concurrency: use last-write-wins with a warning when a conflict is detected
- Do not put confidential client data in seed files; note that shared links expose the job to anyone with the token
- Dashboard KPIs to include: active jobs by status, jobs due this week, overdue count, average cycle time, throughput per month, on-time delivery %
- Notifications are in-app only for now, no email
- All timestamps display in Central Time (CT)

## User Experience & Data Integrity
- Accessibility (a11y): For a professional enterprise application, relying solely on visual cues is a risk. Requirement to add: The application must adhere to basic WCAG accessibility standards, including keyboard navigation (especially for the Kanban boards and data entry), screen reader support, and minimum color contrast.
Add accessibility and usability requirements:
- keyboard navigable
- visible focus states
- ARIA labels where appropriate
- strong color contrast
- reduced-motion support
- mobile/tablet/desktop responsive layouts
- empty states and helpful beginner guidance

- Data Scale and Pagination: The requirements outline list views and Kanban boards but don't address scale. Requirement to add: Define how the UI handles large datasets (e.g., implementing pagination, lazy loading, or infinite scroll when the job inventory exceeds 100 items).
- Import Error Handling: You requested an import wizard for Excel, Microsoft Forms, and JSON. Requirement to add: Define the system's behavior when it encounters malformed data. Option if there is an error ask if it should fail the entire import (all-or-nothing), or  give the option to import the good rows and generate an error report for the bad ones. The import wizard must support:
- importing the preferred JSON format
- importing CSV
- importing Excel-compatible data
- column mapping
- validation preview
- duplicate job number detection
- error report
- import summary
- rollback/cancel before commit

## Open questions
- You can ask me anything needed to make this incredibly excellent.
