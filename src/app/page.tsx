import { Header } from "@/components/layout/Header";
import { PoolView } from "@/components/pool/PoolView";
import { ConnectButton } from "@/components/wallet/ConnectButton";

export default function Page() {
  return (<><Header right={<ConnectButton />} /><PoolView /></>);
}
