import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { Card, Button } from '@wordpress/components';
import { useSiteDetails } from 'src/hooks/use-site-details';

export function WizardHatOverview() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();

	if (!selectedSite) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{__('Wizard Hat Toolkit')}
					</h2>
					<p className="text-gray-600 mb-6">
						{__('Please select a site to use the Wizard Hat Toolkit.')}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div className="max-w-3xl">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">
					{__('Wizard Hat Toolkit')}
				</h2>
				<p className="text-gray-600 mb-6">
					{__('A collection of essential tools for WooCommerce development and testing. This toolkit provides utilities for tunneling, shop configuration, plugin management, and more.')}
				</p>
			</div>

			{/* Quick Actions */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('Quick Actions')}
				</h3>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-2">
						<h4 className="font-medium text-gray-800">
							{__('Jurassic Tube')}
						</h4>
						<p className="text-sm text-gray-600">
							{__('Set up tunneling for payment testing and webhooks')}
						</p>
					</div>
					<div className="space-y-2">
						<h4 className="font-medium text-gray-800">
							{__('Shop Configuration')}
						</h4>
						<p className="text-sm text-gray-600">
							{__('Switch between different WooCommerce locale settings')}
						</p>
					</div>
					<div className="space-y-2">
						<h4 className="font-medium text-gray-800">
							{__('Plugin Management')}
						</h4>
						<p className="text-sm text-gray-600">
							{__('Install and manage WooCommerce plugins')}
						</p>
					</div>
					<div className="space-y-2">
						<h4 className="font-medium text-gray-800">
							{__('Developer Tools')}
						</h4>
						<p className="text-sm text-gray-600">
							{__('Launch Postman and WP-CLI for development')}
						</p>
					</div>
				</div>
			</Card>

			{/* Site Information */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('Current Site')}
				</h3>
				<div className="space-y-3">
					<div className="flex justify-between">
						<span className="text-gray-600">{__('Site Name')}:</span>
						<span className="font-medium">{selectedSite.name}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-600">{__('Path')}:</span>
						<span className="font-medium">{selectedSite.path}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-600">{__('Status')}:</span>
						<span className={`font-medium ${selectedSite.running ? 'text-green-600' : 'text-red-600'}`}>
							{selectedSite.running ? __('Running') : __('Stopped')}
						</span>
					</div>
					{selectedSite.running && (
						<div className="flex justify-between">
							<span className="text-gray-600">{__('URL')}:</span>
							<span className="font-medium">{selectedSite.url}</span>
						</div>
					)}
				</div>
			</Card>

			{/* Getting Started */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-blue-900 mb-2">
					{__('Getting Started')}
				</h3>
				<ol className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">1.</span>
						<span>{__('Set up Jurassic Tube for external access and payment testing')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">2.</span>
						<span>{__('Configure your shop settings for the appropriate locale')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">3.</span>
						<span>{__('Install necessary WooCommerce plugins for your development needs')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">4.</span>
						<span>{__('Use the developer tools for testing and debugging')}</span>
					</li>
				</ol>
			</div>
		</div>
	);
} 