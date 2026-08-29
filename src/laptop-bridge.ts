/**
 * Transport layer for the OrbityLabs mobile companion.
 *
 * The mobile UI owns QR-camera permission and secure storage. This module owns
 * the pairing protocol and only sends the device secret to the paired laptop.
 * It never stores or requests Hermes/provider/Composio credentials.
 */

export type DeviceCredentials = { host: string; deviceId: string; deviceSecret: string };
export type Agent = { id: string; name: string; role: string; initials: string };
export type Profile = { id: string; name: string; kind: string; context: string; agents: Agent[] };
export type Manifest = { host: string; profiles: Profile[] };

export interface SecureDeviceStore {
  load(): Promise<DeviceCredentials | null>;
  save(value: DeviceCredentials): Promise<void>;
  clear(): Promise<void>;
}

type PairingResponse = { pairing_id: string; device_id: string; device_secret: string; paired_with: string };

function normaliseHost(value: string): string {
  const host = new URL(value).origin;
  if (!/^https?:\/\//.test(host)) throw new Error('Pairing host must be an http(s) address');
  return host;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `Laptop request failed (${response.status})`);
  return body as T;
}

export class LaptopBridge {
  constructor(private readonly store: SecureDeviceStore) {}

  /** Pair from a laptop QR URL, e.g. http://192.168.x.x:PORT/?pair=...&token=... */
  async pairFromQrUrl(scannedUrl: string, deviceName: string): Promise<Manifest> {
    const url = new URL(scannedUrl);
    const pairingId = url.searchParams.get('pair');
    const token = url.searchParams.get('token');
    if (!pairingId || !token) throw new Error('This is not an OrbityLabs laptop pairing code');
    const host = normaliseHost(url.toString());
    const paired = await request<PairingResponse>(`${host}/api/pairing/${encodeURIComponent(pairingId)}/complete`, {
      method: 'POST', body: JSON.stringify({ token, device_name: deviceName }),
    });
    await this.store.save({ host, deviceId: paired.device_id, deviceSecret: paired.device_secret });
    return this.manifest();
  }

  /** Pair with the eight-character fallback code displayed by the laptop. */
  async pairFromCode(hostInput: string, code: string, deviceName: string): Promise<Manifest> {
    const host = normaliseHost(hostInput);
    const paired = await request<PairingResponse>(`${host}/api/pairing/manual/complete`, {
      method: 'POST', body: JSON.stringify({ code: code.replace(/\s/g, '').toUpperCase(), device_name: deviceName }),
    });
    await this.store.save({ host, deviceId: paired.device_id, deviceSecret: paired.device_secret });
    return this.manifest();
  }

  async manifest(): Promise<Manifest> {
    const credentials = await this.requireCredentials();
    return request<Manifest>(`${credentials.host}/api/mobile/manifest`, { headers: { 'X-Orbity-Device-Secret': credentials.deviceSecret } });
  }

  /** Send an operator message to the selected profile CEO on the laptop. */
  async messageCEO(profileId: string, message: string): Promise<unknown> {
    const credentials = await this.requireCredentials();
    return request(`${credentials.host}/api/mobile/ceo/messages?profile_id=${encodeURIComponent(profileId)}`, {
      method: 'POST', headers: { 'X-Orbity-Device-Secret': credentials.deviceSecret }, body: JSON.stringify({ message }),
    });
  }

  async unpair(): Promise<void> { await this.store.clear(); }

  private async requireCredentials(): Promise<DeviceCredentials> {
    const value = await this.store.load();
    if (!value) throw new Error('Pair this phone to your laptop first');
    return value;
  }
}
