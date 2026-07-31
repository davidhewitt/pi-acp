import assert from 'node:assert/strict'
import test from 'node:test'
import { PiAcpAgent } from '../../src/acp/agent.js'
import { PiAcpSession, SessionManager } from '../../src/acp/session.js'
import { FakeAgentSideConnection, FakePiRpcProcess, asAgentConn } from '../helpers/fakes.js'

function createSession(proc = new FakePiRpcProcess()) {
  const conn = new FakeAgentSideConnection()
  const session = new PiAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })
  return { session, proc }
}

test('PiAcpAgent: advertises session/close support', async () => {
  const agent = new PiAcpAgent(asAgentConn(new FakeAgentSideConnection()))
  const response = await agent.initialize({ protocolVersion: 1 } as any)

  assert.deepEqual(response.agentCapabilities?.sessionCapabilities?.close, {})
})

test('PiAcpSession: dispose cancels active and queued prompts', async () => {
  const { session, proc } = createSession()
  const active = session.prompt('one')
  const queued = session.prompt('two')

  session.dispose()

  assert.equal(await active, 'cancelled')
  assert.equal(await queued, 'cancelled')
  assert.equal(proc.abortCount, 1)
  assert.equal(proc.disposeCount, 1)

  session.dispose()
  assert.equal(proc.abortCount, 1)
  assert.equal(proc.disposeCount, 1)
})

test('PiAcpAgent: closeSession closes only the requested session', async () => {
  const conn = new FakeAgentSideConnection()
  const manager = new SessionManager()
  const firstProc = new FakePiRpcProcess()
  const secondProc = new FakePiRpcProcess()

  manager.getOrCreate('s1', {
    cwd: process.cwd(),
    mcpServers: [],
    conn: asAgentConn(conn),
    proc: firstProc as any,
    fileCommands: []
  })
  manager.getOrCreate('s2', {
    cwd: process.cwd(),
    mcpServers: [],
    conn: asAgentConn(conn),
    proc: secondProc as any,
    fileCommands: []
  })

  const agent = new PiAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = manager

  assert.deepEqual(await agent.closeSession({ sessionId: 's1' }), {})
  assert.equal(manager.maybeGet('s1'), undefined)
  assert.ok(manager.maybeGet('s2'))
  assert.equal(firstProc.disposeCount, 1)
  assert.equal(secondProc.disposeCount, 0)

  assert.deepEqual(await agent.closeSession({ sessionId: 's1' }), {})
  manager.disposeAll()
})
