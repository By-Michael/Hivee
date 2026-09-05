import LegalLayout from '../components/LegalLayout'

function Section({ heading, children }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-ink-900 dark:text-white">{heading}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="September 2026">
      <p>
        Oudaa ("we", "us", "our") provides software that helps residential
        communities — homeowner associations, condos and compounds — manage
        fees, funds, payments and related records. This policy explains what
        information we collect through the platform, how we use it, and the
        choices available to committees and residents.
      </p>

      <Section heading="1. Who this applies to">
        <p>
          This policy covers everyone who uses Oudaa: committee/admin users
          who manage a community, and resident users who belong to one. If
          your organization runs its own instance of Oudaa, your community's
          admin is responsible for the data entered about its residents, and
          this policy describes how the software itself handles that data.
        </p>
      </Section>

      <Section heading="2. Information we collect">
        <p>We collect information in three ways:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="font-semibold text-ink-800 dark:text-ink-100">Account information</span> — name, email
            address, phone number, unit/household identifier, and a hashed
            password, provided when an account is created (by a committee
            admin or via self-signup, depending on how your community is
            configured).
          </li>
          <li>
            <span className="font-semibold text-ink-800 dark:text-ink-100">Financial and community records</span> —
            fees, payments, fund balances, expenses, projects and receipts
            entered into the platform, including any receipt images
            uploaded and the data extracted from them.
          </li>
          <li>
            <span className="font-semibold text-ink-800 dark:text-ink-100">Usage and log data</span> — actions taken
            in the app (recorded in the audit log for accountability),
            timestamps, and basic technical data like IP address and
            browser type used to keep the service secure and working.
          </li>
        </ul>
      </Section>

      <Section heading="3. How we use this information">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To operate the core features of the platform — fee tracking, payment verification, fund and expense management, and reporting.</li>
          <li>To send account-related email: welcome messages for new residents, password reset links, password-change confirmations, and notifications tied to your community's activity.</li>
          <li>To verify submitted payments against bank transaction data where your community has this enabled, so committees don't have to rely on manual confirmation.</li>
          <li>To maintain an audit trail of administrative actions for security and accountability within your community.</li>
          <li>To keep the service secure, diagnose problems, and improve reliability.</li>
        </ul>
      </Section>

      <Section heading="4. Email delivery">
        <p>
          Transactional emails (welcome messages, password resets, account
          notifications) are sent through a third-party email delivery
          provider on our behalf. That provider processes the recipient
          address and message content solely to deliver the email and does
          not use it for its own marketing purposes.
        </p>
      </Section>

      <Section heading="5. Payment verification">
        <p>
          Where enabled, self-reported resident payments are checked against
          bank transaction records through a third-party verification
          service. Only the information necessary to match a payment (such
          as amount, date and reference) is shared for this purpose.
        </p>
      </Section>

      <Section heading="6. Who can see your data">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Residents can see their own account details and the shared community data their role gives them access to (fees, funds, projects, expenses, reports).</li>
          <li>Committee/admin users can see and manage resident and financial records for their own community.</li>
          <li>Data is scoped to a single community — one community's admins and residents do not see another community's records.</li>
          <li>We do not sell personal data, and we do not share it with third parties for their own marketing.</li>
        </ul>
      </Section>

      <Section heading="7. Data retention">
        <p>
          We retain account and financial records for as long as the
          community's account is active, and for a reasonable period
          afterward to meet accounting, legal and dispute-resolution needs.
          A community admin can request deletion of resident data that is no
          longer required, subject to any records we're required to keep.
        </p>
      </Section>

      <Section heading="8. Security">
        <p>
          Passwords are stored hashed, not in plain text. Access to
          administrative functions is role-based, and administrative actions
          are recorded in an audit log. No system is completely immune to
          risk, and we work to keep the platform's defenses current.
        </p>
      </Section>

      <Section heading="9. Your choices">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>You can review and update your profile information from your account settings.</li>
          <li>You can request a password reset at any time from the login page.</li>
          <li>If you believe your data is inaccurate or should be removed, contact your community's admin or reach us directly (below).</li>
        </ul>
      </Section>

      <Section heading="10. Changes to this policy">
        <p>
          We may update this policy as the platform evolves. Material
          changes will be reflected by updating the date at the top of this
          page.
        </p>
      </Section>

      <Section heading="11. Contact">
        <p>
          Questions about this policy or your data can be sent to{' '}
          <a href="mailto:privacy@oudaa.app" className="text-brand-600 hover:underline dark:text-brand-300">
            privacy@oudaa.app
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  )
}
