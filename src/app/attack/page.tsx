import { Header } from "@/components/layout/Header";
import { AttackView } from "@/components/attack/AttackView";
import { ConnectButton } from "@/components/wallet/ConnectButton";

export default function Page() {
  return (<><Header right={<ConnectButton />} /><AttackView /></>);
}
