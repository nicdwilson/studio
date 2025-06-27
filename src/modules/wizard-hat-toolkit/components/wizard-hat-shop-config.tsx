import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { Button, Card, SelectControl } from '@wordpress/components';
import { useState, useEffect } from 'react';
import { useSiteDetails } from 'src/hooks/use-site-details';
import { getIpcApi } from 'src/lib/get-ipc-api';

interface ShopConfig {
	name: string;
	options: Record<string, string>;
}

const SHOP_CONFIGS: ShopConfig[] = [
	{
		name: 'United States',
		options: {
			woocommerce_store_address: '537 Paper Street',
			woocommerce_store_address_2: '#34',
			woocommerce_store_city: 'Wilmington',
			woocommerce_default_country: 'US:DE',
			woocommerce_store_postcode: '19806',
			woocommerce_currency: 'USD',
			woocommerce_price_thousand_sep: ',',
			woocommerce_price_decimal_sep: '.',
			woocommerce_weight_unit: 'lbs',
			woocommerce_dimension_unit: 'in',
		},
	},
	{
		name: 'Europe',
		options: {
			woocommerce_store_address: 'Brederopad 77',
			woocommerce_store_address_2: '',
			woocommerce_store_city: 'Delft',
			woocommerce_default_country: 'NL',
			woocommerce_store_postcode: '2624 XR',
			woocommerce_currency: 'EUR',
			woocommerce_price_thousand_sep: ' ',
			woocommerce_price_decimal_sep: ',',
			woocommerce_weight_unit: 'kg',
			woocommerce_dimension_unit: 'cm',
		},
	},
	{
		name: 'Australia',
		options: {
			woocommerce_store_address: '28 Kaesler Road',
			woocommerce_store_address_2: '',
			woocommerce_store_city: 'Mount Burr',
			woocommerce_default_country: 'AU:SA',
			woocommerce_store_postcode: '5279',
			woocommerce_currency: 'AUD',
			woocommerce_price_thousand_sep: ' ',
			woocommerce_price_decimal_sep: ',',
			woocommerce_weight_unit: 'kg',
			woocommerce_dimension_unit: 'cm',
		},
	},
	{
		name: 'Canada',
		options: {
			woocommerce_store_address: '40 Bay St',
			woocommerce_store_address_2: '',
			woocommerce_store_city: 'Toronto',
			woocommerce_default_country: 'CA:ON',
			woocommerce_store_postcode: 'M5J 2X2',
			woocommerce_currency: 'CAD',
			woocommerce_price_thousand_sep: ' ',
			woocommerce_price_decimal_sep: ',',
			woocommerce_weight_unit: 'kg',
			woocommerce_dimension_unit: 'cm',
		},
	},
	{
		name: 'U.K.',
		options: {
			woocommerce_store_address: '828 Church Lane',
			woocommerce_store_address_2: '',
			woocommerce_store_city: 'London',
			woocommerce_default_country: 'GB',
			woocommerce_store_postcode: 'N86 2VU',
			woocommerce_currency: 'GBP',
			woocommerce_price_thousand_sep: ' ',
			woocommerce_price_decimal_sep: ',',
			woocommerce_weight_unit: 'kg',
			woocommerce_dimension_unit: 'cm',
		},
	},
	{
		name: 'South Africa',
		options: {
			woocommerce_store_address: '2160 South St',
			woocommerce_store_address_2: '',
			woocommerce_store_city: 'Voortrekkerhoogte',
			woocommerce_default_country: 'ZA:GP',
			woocommerce_store_postcode: '0187',
			woocommerce_currency: 'ZAR',
			woocommerce_price_thousand_sep: ' ',
			woocommerce_price_decimal_sep: ',',
			woocommerce_weight_unit: 'kg',
			woocommerce_dimension_unit: 'cm',
		},
	},
];

export function WizardHatShopConfig() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const { startServer, loadingServer } = useSiteDetails();
	const [switchingTo, setSwitchingTo] = useState<string | null>(null);

	if (!selectedSite) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl px-8">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{__('Shop Configuration')}
					</h2>
					<p className="text-gray-600 mb-6">
						{__('Please select a site to configure shop settings.')}
					</p>
				</div>
			</div>
		);
	}

	const isLoading = selectedSite?.id ? loadingServer[selectedSite.id] : false;

	const switchCountry = async (config: ShopConfig) => {
		if (isLoading || switchingTo) return;

		setSwitchingTo(config.name);

		try {
			// Ensure site is running
			if (!selectedSite.running) {
				await startServer(selectedSite.id);
			}

			// Set WooCommerce options via WP-CLI
			for (const [option, value] of Object.entries(config.options)) {
				await getIpcApi().executeWPCLiInline({
					siteId: selectedSite.id,
					args: `option set ${option} "${value}"`,
				});
			}

			// Show success message
			getIpcApi().showNotification({
				title: __('Success'),
				body: __(`Site configuration switched to ${config.name}`),
			});
		} catch (error) {
			console.error('Error switching country:', error);
			getIpcApi().showErrorMessageBox({
				title: __('Error'),
				message: __('Failed to switch site configuration. Please try again.'),
				error,
			});
		} finally {
			setSwitchingTo(null);
		}
	};

	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">
					{__('Shop Configuration Switcher')}
				</h2>
				<p className="text-gray-600 mb-6">
					{__('Quickly switch your WooCommerce store settings between different geographic regions. This updates currency, address format, weight units, and other locale-specific settings.')}
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{SHOP_CONFIGS.map((config) => (
					<div
						key={config.name}
						className="border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors"
					>
						<h3 className="text-lg font-medium text-gray-900 mb-4">
							{config.name}
						</h3>
						<div className="space-y-2 mb-6 text-sm text-gray-600">
							<div>
								<strong>{__('Currency')}:</strong> {config.options.woocommerce_currency}
							</div>
							<div>
								<strong>{__('Weight Unit')}:</strong> {config.options.woocommerce_weight_unit}
							</div>
							<div>
								<strong>{__('Dimension Unit')}:</strong> {config.options.woocommerce_dimension_unit}
							</div>
							<div>
								<strong>{__('Address')}:</strong> {config.options.woocommerce_store_city}
							</div>
						</div>
						<Button
							variant="primary"
							onClick={() => switchCountry(config)}
							disabled={isLoading || switchingTo === config.name}
							className="w-full"
						>
							{switchingTo === config.name
								? __('Switching...')
								: __('Switch to') + ' ' + config.name}
						</Button>
					</div>
				))}
			</div>

			<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-yellow-900 mb-2">
					{__('Important Notes')}
				</h3>
				<ul className="text-yellow-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('This will update your WooCommerce store settings immediately')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Changes include currency, address format, weight units, and dimension units')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Make sure to test your checkout process after switching configurations')}</span>
					</li>
				</ul>
			</div>
		</div>
	);
} 