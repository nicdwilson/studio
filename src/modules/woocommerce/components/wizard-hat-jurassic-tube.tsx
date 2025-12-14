import { Card } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';

export function WizardHatJurassicTube() {
	const { __ } = useI18n();

	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Jurassic Tube' ) }</h2>
				<p className="text-gray-600 mb-6">
					{ __( 'Jurassic Tube tunneling functionality is coming soon!' ) }
				</p>
			</div>

			<Card className="p-6">
				<div className="text-center">
					<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Coming Soon' ) }</h3>
					<p className="text-gray-600 mb-4">
						{ __(
							'Jurassic Tube is an in-house tunneling solution similar to ngrok. It allows your local test site to be reached from the internet via a .jurassic.tube subdomain over an SSH tunnel.'
						) }
					</p>
					<p className="text-gray-500 text-sm">
						{ __(
							'This feature is currently under development and will be available in a future update.'
						) }
					</p>
				</div>
			</Card>
		</div>
	);
}
