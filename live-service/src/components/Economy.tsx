import { useState } from "react";
import { Heading, Button } from "./ui";
export default function Economy({ state }: { state: any }) {
  const [view, V] = useState("wallet");
  const modules = [
    ["wallet", "Wallet", "Address, connection and recovery"],
    ["qb", "QB", "Service and learning credits"],
    ["flux", "FLUX", "Verified performance coefficient"],
    ["aiusd", "AIUSD", "System settlement"],
    ["personal", "Personal token", "Issuer’s service rights"],
  ];
  return (
    <>
      <Heading tag="My space / Assets and capabilities" title="See where your budget goes." />
      <div className="economy-tabs" role="group" aria-label="Economy">
        {modules.map(([id, label]) => (
          <button key={id} aria-pressed={view === id} onClick={() => V(id)}>
            {label}
          </button>
        ))}
      </div>
      {view === "wallet" ? (
        <article>
          <small>Service offline</small>
          <h2>Your wallet</h2>
          <p>
            Your wallet provider creates the address. It is separate from your personal and AI IDs.
          </p>
          <div className="wallet-placeholder">
            <span>No on-chain address available</span>
            <small>Network, address and receive QR appear after connection</small>
          </div>
          <Button onClick={() => location.assign("/")}>
            Open live account and check wallet
          </Button>
          <details>
            <summary>Wallet recovery and signing</summary>
            <p>
              Your account and wallet provider handle recovery. Private keys are not displayed. Transfers require separate confirmation of recipient, amount, fees and permissions.
            </p>
          </details>
          <p className="note">This preview provides no wallet address or asset transactions.</p>
        </article>
      ) : view === "qb" ? (
        <>
          <article>
            <small>Preview credits</small>
            <h2 className="balance-value">
              {state.balance} <span>QB</span>
            </h2>
            <p>Credits fund service and learning orders. Unused reservations are released.</p>
          </article>
          <h2>Orders</h2>
          {state.orders.length ? (
            state.orders.map((o: any) => (
              <article key={o.id}>
                <small>{o.type === "learning" ? "Learning order" : "Service order"}</small>
                <p>
                  {(
                    {
                      complete: "Delivered",
                      reserved: "Reserved",
                      learning: "Learning in progress",
                      paused: "Paused",
                      passed: "Verified",
                      cancelled: "Canceled",
                      failed: "Failed",
                      pending_validation: "Awaiting validation",
                      "no-gain": "No improvement",
                    } as Record<string, string>
                  )[o.status] || "Processing"}
                </p>
                <p>
                  Spent {o.spent || 0} QB · Reserved {o.reserved || 0} QB · Released{" "}
                  {o.released || 0} QB
                </p>
                <small className="address">{o.id}</small>
              </article>
            ))
          ) : (
            <p>No orders yet. Approve learning or a service to see its order here.</p>
          )}
          <p className="note">Sample credits only. Top-ups are unavailable.</p>
        </>
      ) : view === "flux" ? (
        <article>
          <small>No validation record yet</small>
          <h2>FLUX</h2>
          <p>
            Based on verified delivery, judgment quality and collaboration. Errors and breaches affect the record.
          </p>
          <p>
            Connections and spending do not establish judgment quality. Scores, purchases and transfers are unavailable.
          </p>
        </article>
      ) : view === "aiusd" ? (
        <article>
          <small>Settlement service offline</small>
          <h2>AIUSD</h2>
          <p>
            For network pricing and settlement. Issuance, reserves, redemption and trading rules must be defined before launch.
          </p>
          <p>No tradable balance. Buying, swapping and transfers are unavailable.</p>
        </article>
      ) : (
        <article>
          <small>Entitlement service offline</small>
          <h2>Personal token</h2>
          <p>Service rights set by the issuer, with separate terms for human and AI services.</p>
          <p>
            Before buying, review the service, price, availability and refund terms. Issuance and trading are unavailable.
          </p>
        </article>
      )}
    </>
  );
}
