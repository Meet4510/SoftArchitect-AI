import { beforeEach, describe, expect, it } from 'vitest'
import { demoProjects } from '../src/lib/demo-data'
import {
  fetchProjectDocumentation,
  generateProjectApiDesign,
  generateProjectArchitecture,
  generateProjectDatabaseDesign,
  generateProjectDiagrams,
  generateProjectDocumentation,
  recommendProjectTechnology,
} from '../src/services/api'

const demoToken = 'demo-token'
const project = demoProjects[0]
const softwareEngineeringProject = {
  ...project,
  id: 'proj-ai-engineer',
  name: 'AI Software Engineer',
  domain: 'Developer Tools / Artificial Intelligence',
  description: 'An AI assistant that proposes reviewable changes for software teams.',
  requirements: [
    'Developers and team leads work in shared workspaces, invite members, and manage software projects.',
    'Developers create coding tasks and connect Git repositories.',
    'An AI agent analyzes tasks, records agent runs, and creates proposed code changes.',
    'Team leads review diffs, leave comments, and approve or reject changes before any changes are applied.',
    'Administrators manage users. Notify users when runs finish or a review is requested.',
  ].join(' '),
}

describe('Demo Mode project documentation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('uses the prompt to generate tailored sections and persists the document', async () => {
    const prompt = 'Create an API and testing handoff for backend developers.'

    const generated = await generateProjectDocumentation(demoToken, project, ` ${prompt} `)

    expect(generated.generation_prompt).toBe(prompt)
    expect(generated.custom_sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(['API implementation details', 'Testing guidance']),
    )
    expect(generated.markdown).toContain(prompt)
    await expect(fetchProjectDocumentation(demoToken, project.id)).resolves.toEqual(generated)
  })

  it.each(['', 'short', 'x'.repeat(4001)])(
    'rejects prompts outside the supported length: %j',
    async (prompt) => {
      await expect(generateProjectDocumentation(demoToken, project, prompt)).rejects.toThrow(
        '10–4000 characters',
      )
    },
  )

  it('rejects projects without enough requirements', async () => {
    const incompleteProject = { ...project, requirements: 'Too short' }

    await expect(
      generateProjectDocumentation(demoToken, incompleteProject, 'Create a complete technical handoff.'),
    ).rejects.toThrow('at least 20 characters')
  })

  it('generates AI software engineer data designs, API, and diagrams from its requirements', async () => {
    await recommendProjectTechnology(demoToken, softwareEngineeringProject)
    await generateProjectArchitecture(demoToken, softwareEngineeringProject)
    const database = await generateProjectDatabaseDesign(demoToken, softwareEngineeringProject)
    const api = await generateProjectApiDesign(demoToken, softwareEngineeringProject)
    const diagrams = await generateProjectDiagrams(demoToken, softwareEngineeringProject)

    const collectionNames = database.collections.map((collection) => collection.name)
    expect(collectionNames).toEqual(expect.arrayContaining([
      'workspaces',
      'workspace_memberships',
      'projects',
      'tasks',
      'repository_connections',
      'agent_runs',
      'proposed_changes',
      'reviews',
      'review_comments',
      'notifications',
    ]))
    expect(collectionNames).not.toContain('restaurants')
    expect(api.endpoints.map((endpoint) => endpoint.path)).toContain('/api/v1/proposed-changes')
    expect(api.endpoints.map((endpoint) => endpoint.path)).not.toContain('/api/v1/orders')
    const useCase = diagrams.diagrams.find((diagram) => diagram.diagram_type === 'use_case')
    expect(useCase?.mermaid_source).toContain('Run AI engineering workflow')
    expect(useCase?.mermaid_source).toContain('Review and approve proposed changes')
    expect(JSON.stringify(diagrams.diagrams)).not.toContain('restaurants')
  })
})
