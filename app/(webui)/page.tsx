import AuthButton from '@/components/auth/AuthButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute top-24 -left-20 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,107,53,0.35),transparent_60%)] blur-2xl" />
      <div className="pointer-events-none absolute top-0 -right-16 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(27,77,62,0.35),transparent_60%)] blur-3xl" />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16">
        <div className="flex flex-col gap-6">
          <p className="text-sm tracking-[0.3em] text-(--moss) uppercase">LotteryLunch Portal</p>
          <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">Meet someone new over lunch.</h1>
          <p className="max-w-2xl text-lg text-[rgba(20,18,21,0.7)]">
            Create a group, choose your available times, and opt into the lunch lottery. Your organizer draws pairings
            when the group is ready, and you can add your lunch to your calendar.
          </p>
          <div className="flex flex-wrap gap-3">
            <AuthButton />
            <Button variant="ghost" as={Link} href="/portal">
              Open portal
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Group-first setup',
              body: 'Create a group, invite teammates, and keep membership rules clear.',
            },
            {
              title: 'Human pairing rules',
              body: 'Draw pairings from participating members with overlapping lunch availability.',
            },
            {
              title: 'Calendar-ready output',
              body: 'Download a private ICS event or add your lunch to your connected Google Calendar.',
            },
          ].map((item) => (
            <Card key={item.title} title={item.title}>
              <p className="text-sm text-[rgba(20,18,21,0.7)]">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
